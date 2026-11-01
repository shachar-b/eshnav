import { eq } from 'drizzle-orm';
import {
  getLogicalDateString,
  type CompletePoolChoreResponse,
  type UndoPoolCompletionResponse,
} from '@eshnav/shared';
import type { AppDb } from '../db/connection.js';
import { poolChores, poolCompletions, profiles, starTransactions } from '../db/schema.js';
import { DomainError } from './errors.js';

export function completePoolChore(
  db: AppDb,
  poolChoreId: number,
  profileId: number,
  now: number = Date.now(),
): CompletePoolChoreResponse {
  return db.transaction((tx) => {
    const chore = tx.select().from(poolChores).where(eq(poolChores.id, poolChoreId)).get();
    if (!chore) throw new DomainError('NOT_FOUND', 'משימה בקופה לא נמצאה');

    const profile = tx.select().from(profiles).where(eq(profiles.id, profileId)).get();
    if (!profile || !profile.isActive) throw new DomainError('NOT_FOUND', 'פרופיל ילד לא נמצא');

    if (!chore.isActive) {
      throw new DomainError('CONFLICT', 'המשימה אינה פעילה כרגע');
    }
    if (chore.cooldownEndsAt !== null && now < chore.cooldownEndsAt) {
      throw new DomainError('CONFLICT', 'המשימה בהשהיה כרגע');
    }

    const logicalDate = getLogicalDateString(now);
    const completion = tx
      .insert(poolCompletions)
      .values({
        poolChoreId: chore.id,
        profileId,
        titleSnapshot: chore.title,
        iconEmojiSnapshot: chore.iconEmoji,
        starsAwarded: chore.stars,
        logicalDate,
        completedAt: now,
      })
      .returning()
      .get();

    if (chore.stars > 0) {
      tx.insert(starTransactions)
        .values({
          profileId,
          sourceType: 'POOL_CHORE',
          sourceId: completion.id,
          starsDelta: chore.stars,
          description: chore.title,
          logicalDate,
          createdAt: now,
        })
        .run();
    }

    if (chore.resetMode === 'COOLDOWN') {
      tx.update(poolChores)
        .set({
          lastCompletedAt: now,
          cooldownEndsAt: now + chore.cooldownMinutes * 60_000,
        })
        .where(eq(poolChores.id, chore.id))
        .run();
    } else {
      tx.update(poolChores)
        .set({
          isActive: false,
          cooldownEndsAt: null,
          lastCompletedAt: now,
        })
        .where(eq(poolChores.id, chore.id))
        .run();
    }

    return {
      poolCompletionId: completion.id,
      poolChoreId: chore.id,
      profileId,
      starsAwarded: chore.stars,
    };
  });
}

export function undoPoolCompletion(
  db: AppDb,
  poolCompletionId: number,
  now: number = Date.now(),
): UndoPoolCompletionResponse {
  return db.transaction((tx) => {
    const completion = tx.select().from(poolCompletions).where(eq(poolCompletions.id, poolCompletionId)).get();
    if (!completion) throw new DomainError('NOT_FOUND', 'רישום השלמת משימה לא נמצא');

    tx.delete(poolCompletions).where(eq(poolCompletions.id, completion.id)).run();

    const logicalDate = getLogicalDateString(now);
    if (completion.starsAwarded > 0) {
      tx.insert(starTransactions)
        .values({
          profileId: completion.profileId,
          sourceType: 'UNDO',
          sourceId: completion.id,
          starsDelta: -completion.starsAwarded,
          description: `ביטול: ${completion.titleSnapshot}`,
          logicalDate,
          createdAt: now,
        })
        .run();
    }

    if (completion.poolChoreId !== null) {
      const parentChore = tx.select().from(poolChores).where(eq(poolChores.id, completion.poolChoreId)).get();
      if (parentChore) {
        tx.update(poolChores)
          .set({
            cooldownEndsAt: null,
            ...(parentChore.resetMode === 'AUTO_DISABLE' ? { isActive: true } : {}),
          })
          .where(eq(poolChores.id, parentChore.id))
          .run();
      }
    }

    return {
      poolCompletionId: completion.id,
      poolChoreId: completion.poolChoreId,
      starsDelta: completion.starsAwarded > 0 ? -completion.starsAwarded : 0,
    };
  });
}
