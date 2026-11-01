import { eq } from 'drizzle-orm';
import {
  getIsraeliDayOfWeek,
  getLogicalDateString,
  isValidLogicalDate,
  shiftLogicalDate,
} from '@eshnav/shared';
import type { AppDb } from '../db/connection.js';
import { profiles, routineDailyLogs, routineTemplates } from '../db/schema.js';
import { DomainError } from './errors.js';

const MAX_CATCHUP_DAYS = 90;

/**
 * Seals all unlogged scheduled active routines on `logicalDate` as `MISSED`.
 * Uses `.onConflictDoNothing()` on `(routineId, logicalDate)` so repeated runs are 100% idempotent.
 */
export function runDailyRollover(db: AppDb, logicalDate: string): number {
  if (!isValidLogicalDate(logicalDate)) {
    throw new DomainError('VALIDATION_ERROR', `תאריך לא תקין: ${logicalDate}`);
  }
  const dayOfWeek = getIsraeliDayOfWeek(logicalDate);

  return db.transaction((tx) => {
    const activeRows = tx
      .select({ routine: routineTemplates })
      .from(routineTemplates)
      .innerJoin(profiles, eq(routineTemplates.profileId, profiles.id))
      .where(eq(routineTemplates.isActive, true))
      .all();

    const activeProfileIds = new Set(
      tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.isActive, true))
        .all()
        .map((p) => p.id),
    );

    let inserted = 0;
    for (const { routine } of activeRows) {
      if (!activeProfileIds.has(routine.profileId)) continue;
      if (getLogicalDateString(routine.createdAt) > logicalDate) continue;
      if (!routine.daysOfWeekJson.includes(dayOfWeek)) continue;

      const res = tx
        .insert(routineDailyLogs)
        .values({
          routineId: routine.id,
          profileId: routine.profileId,
          titleSnapshot: routine.title,
          iconEmojiSnapshot: routine.iconEmoji,
          timeWindowSnapshot: routine.timeWindow,
          logicalDate,
          status: 'MISSED',
          completedAt: null,
        })
        .onConflictDoNothing()
        .run();

      inserted += res.changes;
    }

    return inserted;
  });
}

/**
 * Boot-time and midnight catch-up: seals every past date `D < today` (since each routine's
 * creation date, bounded to the last 90 days) that lacks a log entry.
 */
export function runCatchUpRollover(db: AppDb, now: number = Date.now()): number {
  const today = getLogicalDateString(now);
  const yesterday = shiftLogicalDate(today, -1);
  const floorDate = shiftLogicalDate(today, -MAX_CATCHUP_DAYS);

  return db.transaction((tx) => {
    const activeProfileIds = new Set(
      tx
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.isActive, true))
        .all()
        .map((p) => p.id),
    );

    const routines = tx
      .select()
      .from(routineTemplates)
      .where(eq(routineTemplates.isActive, true))
      .all()
      .filter((r) => activeProfileIds.has(r.profileId))
      .map((r) => ({ routine: r, createdDate: getLogicalDateString(r.createdAt) }));

    if (routines.length === 0) return 0;

    let earliest = yesterday;
    for (const { createdDate } of routines) {
      if (createdDate < earliest) earliest = createdDate;
    }
    if (earliest < floorDate) earliest = floorDate;
    if (earliest > yesterday) return 0;

    let inserted = 0;
    for (let cursor = earliest; cursor <= yesterday; cursor = shiftLogicalDate(cursor, 1)) {
      const dow = getIsraeliDayOfWeek(cursor);
      for (const { routine, createdDate } of routines) {
        if (createdDate > cursor) continue;
        if (!routine.daysOfWeekJson.includes(dow)) continue;

        const res = tx
          .insert(routineDailyLogs)
          .values({
            routineId: routine.id,
            profileId: routine.profileId,
            titleSnapshot: routine.title,
            iconEmojiSnapshot: routine.iconEmoji,
            timeWindowSnapshot: routine.timeWindow,
            logicalDate: cursor,
            status: 'MISSED',
            completedAt: null,
          })
          .onConflictDoNothing()
          .run();

        inserted += res.changes;
      }
    }

    return inserted;
  });
}
