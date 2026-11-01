import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  getIsraeliDayOfWeek,
  getLogicalDateString,
  type PersonalChoreToggleResponse,
  type RoutineToggleResponse,
} from '@eshnav/shared';
import type { AppDb } from '../db/connection.js';
import { personalChores, profiles, routineDailyLogs, routineTemplates, starTransactions } from '../db/schema.js';
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

    const profile = tx.select().from(profiles).where(eq(profiles.id, routine.profileId)).get();
    if (!profile || !profile.isActive) throw new DomainError('NOT_FOUND', 'פרופיל ילד לא נמצא');
    if (!routine.isActive || !routine.daysOfWeekJson.includes(getIsraeliDayOfWeek(logicalDate))) {
      throw new DomainError('CONFLICT', 'השגרה אינה פעילה או אינה מתוזמנת להיום');
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
      const profile = tx.select().from(profiles).where(eq(profiles.id, chore.profileId)).get();
      if (!profile || !profile.isActive) throw new DomainError('NOT_FOUND', 'פרופיל ילד לא נמצא');

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

    if (chore.completedDate !== logicalDate) {
      throw new DomainError('CONFLICT', 'ניתן לבטל סימון משימה רק ביום השלמתה');
    }

    const latestLedger = tx
      .select({ sourceType: starTransactions.sourceType, starsDelta: starTransactions.starsDelta })
      .from(starTransactions)
      .where(
        and(
          eq(starTransactions.sourceId, chore.id),
          inArray(starTransactions.sourceType, ['PERSONAL_CHORE', 'UNDO']),
        ),
      )
      .orderBy(desc(starTransactions.id))
      .limit(1)
      .get();
    const starsToDeduct =
      latestLedger?.sourceType === 'PERSONAL_CHORE' && latestLedger.starsDelta > 0
        ? latestLedger.starsDelta
        : 0;

    tx.update(personalChores)
      .set({ status: 'PENDING', completedDate: null, completedAt: null })
      .where(eq(personalChores.id, choreId))
      .run();

    if (starsToDeduct > 0) {
      tx.insert(starTransactions)
        .values({
          profileId: chore.profileId,
          sourceType: 'UNDO',
          sourceId: chore.id,
          starsDelta: -starsToDeduct,
          description: `ביטול: ${chore.title}`,
          logicalDate,
          createdAt: now,
        })
        .run();
    }

    return { choreId, status: 'PENDING', starsDelta: starsToDeduct > 0 ? -starsToDeduct : 0 };
  });
}
