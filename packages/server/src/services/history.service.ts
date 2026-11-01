import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  TIME_WINDOWS,
  getIsraeliDayOfWeek,
  getLogicalDateString,
  isTimeWindowElapsed,
  isValidLogicalDate,
  type HistoryChore,
  type HistoryProfile,
  type HistoryResponse,
  type HistoryRoutine,
  type Rings,
  type TimeWindow,
  type ToggleHistoryRoutineResponse,
} from '@eshnav/shared';
import type { AppDb } from '../db/connection.js';
import {
  personalChores,
  poolCompletions,
  profiles,
  routineDailyLogs,
  routineTemplates,
  starTransactions,
} from '../db/schema.js';
import { DomainError } from './errors.js';

export const WINDOW_ORDER: Record<TimeWindow, number> = {
  MORNING: 0,
  AFTERNOON: 1,
  EVENING: 2,
};

export function computeRingsFromCounts(
  countsByWindow: Record<TimeWindow, { total: number; completed: number }>,
  logicalDate: string,
  now: number,
): Rings {
  const build = (w: TimeWindow) => {
    const { total, completed } = countsByWindow[w];
    const unfinished = Math.max(0, total - completed);
    const isWindowElapsed = isTimeWindowElapsed(w, logicalDate, now);
    return {
      totalScheduled: total,
      completedCount: completed,
      redMissedCount: isWindowElapsed ? unfinished : 0,
      greyRemainingCount: isWindowElapsed ? 0 : unfinished,
      isWindowElapsed,
    };
  };

  return {
    MORNING: build('MORNING'),
    AFTERNOON: build('AFTERNOON'),
    EVENING: build('EVENING'),
  };
}

export function getDailyHistory(
  db: AppDb,
  logicalDate: string,
  now: number = Date.now(),
): HistoryResponse {
  if (!isValidLogicalDate(logicalDate)) {
    throw new DomainError('VALIDATION_ERROR', 'תאריך לא תקין');
  }
  const today = getLogicalDateString(now);
  if (logicalDate > today) {
    throw new DomainError('VALIDATION_ERROR', 'לא ניתן לצפות בהיסטוריה של תאריך עתידי');
  }

  const isToday = logicalDate === today;
  const dayOfWeek = getIsraeliDayOfWeek(logicalDate);

  const activeProfiles = db
    .select()
    .from(profiles)
    .where(eq(profiles.isActive, true))
    .orderBy(asc(profiles.sortOrder), asc(profiles.id))
    .all();

  if (activeProfiles.length === 0) {
    return { logicalDate, isToday, profiles: [] };
  }

  const totalStarsRows = db
    .select({
      profileId: starTransactions.profileId,
      total: sql<number>`coalesce(sum(${starTransactions.starsDelta}), 0)`,
    })
    .from(starTransactions)
    .groupBy(starTransactions.profileId)
    .all();
  const totalStarsByProfile = new Map(totalStarsRows.map((r) => [r.profileId, Number(r.total)]));

  const dailyStarsRows = db
    .select({
      profileId: starTransactions.profileId,
      earned: sql<number>`coalesce(sum(${starTransactions.starsDelta}), 0)`,
    })
    .from(starTransactions)
    .where(
      and(
        eq(starTransactions.logicalDate, logicalDate),
        inArray(starTransactions.sourceType, ['PERSONAL_CHORE', 'POOL_CHORE', 'UNDO']),
      ),
    )
    .groupBy(starTransactions.profileId)
    .all();
  const dailyStarsByProfile = new Map(dailyStarsRows.map((r) => [r.profileId, Number(r.earned)]));

  const dayLogs = db
    .select()
    .from(routineDailyLogs)
    .where(eq(routineDailyLogs.logicalDate, logicalDate))
    .orderBy(asc(routineDailyLogs.id))
    .all();

  const activeTemplates = db
    .select()
    .from(routineTemplates)
    .where(eq(routineTemplates.isActive, true))
    .orderBy(asc(routineTemplates.sortOrder), asc(routineTemplates.id))
    .all();

  const completedPersonal = db
    .select()
    .from(personalChores)
    .where(and(eq(personalChores.status, 'COMPLETED'), eq(personalChores.completedDate, logicalDate)))
    .all();

  const completedPool = db
    .select()
    .from(poolCompletions)
    .where(eq(poolCompletions.logicalDate, logicalDate))
    .all();

  const resultProfiles: HistoryProfile[] = activeProfiles.map((profile) => {
    const profileLogs = dayLogs.filter((l) => l.profileId === profile.id);
    const loggedRoutineIds = new Set(
      profileLogs.map((l) => l.routineId).filter((id): id is number => id !== null),
    );

    const routines: HistoryRoutine[] = profileLogs.map((l) => ({
      routineId: l.routineId,
      title: l.titleSnapshot,
      iconEmoji: l.iconEmojiSnapshot,
      timeWindow: l.timeWindowSnapshot,
      status: l.status,
      completedAt: l.completedAt,
    }));

    const scheduledTemplates = activeTemplates.filter(
      (t) =>
        t.profileId === profile.id &&
        t.daysOfWeekJson.includes(dayOfWeek) &&
        !loggedRoutineIds.has(t.id),
    );

    for (const tmpl of scheduledTemplates) {
      const elapsed = isTimeWindowElapsed(tmpl.timeWindow, logicalDate, now);
      routines.push({
        routineId: tmpl.id,
        title: tmpl.title,
        iconEmoji: tmpl.iconEmoji,
        timeWindow: tmpl.timeWindow,
        status: elapsed ? 'MISSED' : 'PENDING',
        completedAt: null,
      });
    }

    routines.sort((a, b) => WINDOW_ORDER[a.timeWindow] - WINDOW_ORDER[b.timeWindow]);

    const counts: Record<TimeWindow, { total: number; completed: number }> = {
      MORNING: { total: 0, completed: 0 },
      AFTERNOON: { total: 0, completed: 0 },
      EVENING: { total: 0, completed: 0 },
    };
    for (const w of TIME_WINDOWS) {
      const inW = routines.filter((r) => r.timeWindow === w);
      counts[w] = {
        total: inW.length,
        completed: inW.filter((r) => r.status === 'COMPLETED').length,
      };
    }

    const chores: HistoryChore[] = [
      ...completedPersonal
        .filter((c) => c.profileId === profile.id)
        .map(
          (c): HistoryChore => ({
            kind: 'PERSONAL_CHORE',
            id: c.id,
            title: c.title,
            iconEmoji: c.iconEmoji,
            stars: c.stars,
            completedAt: c.completedAt ?? c.createdAt,
          }),
        ),
      ...completedPool
        .filter((p) => p.profileId === profile.id)
        .map(
          (p): HistoryChore => ({
            kind: 'POOL_COMPLETION',
            id: p.id,
            title: p.titleSnapshot,
            iconEmoji: p.iconEmojiSnapshot,
            stars: p.starsAwarded,
            completedAt: p.completedAt,
          }),
        ),
    ].sort((a, b) => a.completedAt - b.completedAt);

    return {
      id: profile.id,
      name: profile.name,
      avatarEmoji: profile.avatarEmoji,
      avatarImageUrl: profile.avatarImageUrl,
      pastelTheme: profile.pastelTheme,
      totalStars: totalStarsByProfile.get(profile.id) ?? 0,
      starsEarnedThatDay: dailyStarsByProfile.get(profile.id) ?? 0,
      rings: computeRingsFromCounts(counts, logicalDate, now),
      routines,
      chores,
    };
  });

  return {
    logicalDate,
    isToday,
    profiles: resultProfiles,
  };
}

export function togglePastRoutineStatus(
  db: AppDb,
  routineId: number,
  logicalDate: string,
  now: number = Date.now(),
): ToggleHistoryRoutineResponse {
  if (!isValidLogicalDate(logicalDate)) {
    throw new DomainError('VALIDATION_ERROR', 'תאריך לא תקין');
  }
  const today = getLogicalDateString(now);
  if (logicalDate >= today) {
    throw new DomainError('CONFLICT', 'בעמוד ההיסטוריה ניתן לערוך רק ימים שעברו');
  }

  return db.transaction((tx) => {
    const routine = tx.select().from(routineTemplates).where(eq(routineTemplates.id, routineId)).get();
    if (!routine) throw new DomainError('NOT_FOUND', 'שגרה לא נמצאה');

    const existing = tx
      .select()
      .from(routineDailyLogs)
      .where(and(eq(routineDailyLogs.routineId, routineId), eq(routineDailyLogs.logicalDate, logicalDate)))
      .get();

    if (existing && existing.status === 'COMPLETED') {
      tx.update(routineDailyLogs)
        .set({ status: 'MISSED', completedAt: null })
        .where(eq(routineDailyLogs.id, existing.id))
        .run();
      return { routineId, logicalDate, status: 'MISSED' };
    }

    if (existing) {
      tx.update(routineDailyLogs)
        .set({ status: 'COMPLETED', completedAt: now })
        .where(eq(routineDailyLogs.id, existing.id))
        .run();
      return { routineId, logicalDate, status: 'COMPLETED' };
    }

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

    return { routineId, logicalDate, status: 'COMPLETED' };
  });
}
