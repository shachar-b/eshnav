import { and, eq } from 'drizzle-orm';
import {
  getLogicalDateString,
  type PersonalChoreToggleResponse,
  type RoutineToggleResponse,
} from '@eshnav/shared';
import type { AppDb } from '../db/connection.js';
import { personalChores, routineDailyLogs, routineTemplates, starTransactions } from '../db/schema.js';
import { DomainError } from './errors.js';

export function toggleRoutineForToday(
  db: AppDb,
  routineId: number,
  now: number = Date.now(),
): RoutineToggleResponse {
  return db.transaction((tx) => {
    const routine = tx.select().from(routineTemplates).where(eq(routineTemplates.id, routineId)).get();
    if (!routine) throw new DomainError('NOT_FOUND', 'שגרה לא נמצאה');

    const logicalDate = getLogicalDateString(now);
    const existing = tx
      .select()
      .from(routineDailyLogs)
      .where(and(eq(routineDailyLogs.routineId, routineId), eq(routineDailyLogs.logicalDate, logicalDate)))
      .get();

    if (existing && existing.status === 'COMPLETED') {
      tx.delete(routineDailyLogs).where(eq(routineDailyLogs.id, existing.id)).run();
      return { routineId, logicalDate, isCompleted: false };
    }

    if (existing) {
      tx.update(routineDailyLogs)
        .set({ status: 'COMPLETED', completedAt: now })
        .where(eq(routineDailyLogs.id, existing.id))
        .run();
    } else {
      tx.insert(routineDailyLogs)
        .values({
          routineId: routine.id,
          profileId: routine.profileId,
          titleSnapshot: routine.title,
          iconEmojiSnapshot: routine.iconEmoji,
          timeWindowSnapshot: routine.timeWindow,
          logicalDate,
          status: 'COMPLETED',
          completedAt: now,
        })
        .run();
    }

    return { routineId, logicalDate, isCompleted: true };
  });
}

export function togglePersonalChore(
  db: AppDb,
  choreId: number,
  now: number = Date.now(),
): PersonalChoreToggleResponse {
  return db.transaction((tx) => {
    const chore = tx.select().from(personalChores).where(eq(personalChores.id, choreId)).get();
    if (!chore) throw new DomainError('NOT_FOUND', 'משימה אישית לא נמצאה');

    const logicalDate = getLogicalDateString(now);

    if (chore.status === 'PENDING') {
      tx.update(personalChores)
        .set({ status: 'COMPLETED', completedDate: logicalDate, completedAt: now })
        .where(eq(personalChores.id, choreId))
        .run();

      if (chore.stars > 0) {
        tx.insert(starTransactions)
          .values({
            profileId: chore.profileId,
            sourceType: 'PERSONAL_CHORE',
            sourceId: chore.id,
            starsDelta: chore.stars,
            description: chore.title,
            logicalDate,
            createdAt: now,
          })
          .run();
      }

      return { choreId, status: 'COMPLETED', starsDelta: chore.stars };
    }

    tx.update(personalChores)
      .set({ status: 'PENDING', completedDate: null, completedAt: null })
      .where(eq(personalChores.id, choreId))
      .run();

    if (chore.stars > 0) {
      tx.insert(starTransactions)
        .values({
          profileId: chore.profileId,
          sourceType: 'UNDO',
          sourceId: chore.id,
          starsDelta: -chore.stars,
          description: `ביטול: ${chore.title}`,
          logicalDate,
          createdAt: now,
        })
        .run();
    }

    return { choreId, status: 'PENDING', starsDelta: chore.stars > 0 ? -chore.stars : 0 };
  });
}
