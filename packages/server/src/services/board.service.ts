import { asc, eq, sql } from 'drizzle-orm';
import {
  TIME_WINDOWS,
  getCurrentTimeWindow,
  getIsraeliDayOfWeek,
  getLogicalDateString,
  type BoardProfile,
  type BoardResponse,
  type CompletedItem,
  type TimeWindow,
} from '@eshnav/shared';
import type { AppDb } from '../db/connection.js';
import {
  personalChores,
  poolChores,
  poolCompletions,
  profiles,
  routineDailyLogs,
  routineTemplates,
  starTransactions,
} from '../db/schema.js';
import { getPublicSettings } from './admin.service.js';
import { WINDOW_ORDER, computeRingsFromCounts } from './history.service.js';

export function getFamilyBoard(db: AppDb, now: number = Date.now()): BoardResponse {
  const logicalDate = getLogicalDateString(now);
  const currentWindow = getCurrentTimeWindow(now);
  const dayOfWeek = getIsraeliDayOfWeek(logicalDate);
  const settings = getPublicSettings(db, now);

  const activeProfiles = db
    .select()
    .from(profiles)
    .where(eq(profiles.isActive, true))
    .orderBy(asc(profiles.sortOrder), asc(profiles.id))
    .all();

  const availablePoolChores = db
    .select()
    .from(poolChores)
    .where(eq(poolChores.isActive, true))
    .orderBy(asc(poolChores.sortOrder), asc(poolChores.id))
    .all()
    .filter((c) => c.cooldownEndsAt === null || now >= c.cooldownEndsAt)
    .map((c) => ({
      id: c.id,
      title: c.title,
      iconEmoji: c.iconEmoji,
      stars: c.stars,
    }));

  if (activeProfiles.length === 0) {
    return {
      logicalDate,
      currentWindow,
      settings,
      profiles: [],
      poolChores: availablePoolChores,
    };
  }

  const totalStarsRows = db
    .select({
      profileId: starTransactions.profileId,
      total: sql<number>`coalesce(sum(${starTransactions.starsDelta}), 0)`,
    })
    .from(starTransactions)
    .groupBy(starTransactions.profileId)
    .all();
  const starsByProfile = new Map(totalStarsRows.map((r) => [r.profileId, Number(r.total)]));

  const activeTemplates = db
    .select()
    .from(routineTemplates)
    .where(eq(routineTemplates.isActive, true))
    .orderBy(asc(routineTemplates.sortOrder), asc(routineTemplates.id))
    .all();

  const todayLogs = db
    .select()
    .from(routineDailyLogs)
    .where(eq(routineDailyLogs.logicalDate, logicalDate))
    .all();

  const allPersonalChores = db
    .select()
    .from(personalChores)
    .orderBy(asc(personalChores.createdAt), asc(personalChores.id))
    .all();

  const todayPoolCompletions = db
    .select()
    .from(poolCompletions)
    .where(eq(poolCompletions.logicalDate, logicalDate))
    .all();

  const boardProfiles: BoardProfile[] = activeProfiles.map((profile) => {
    const scheduledToday = activeTemplates
      .filter((t) => t.profileId === profile.id && t.daysOfWeekJson.includes(dayOfWeek))
      .sort(
        (a, b) =>
          WINDOW_ORDER[a.timeWindow] - WINDOW_ORDER[b.timeWindow] ||
          a.sortOrder - b.sortOrder ||
          a.id - b.id,
      );
    const completedLogs = todayLogs.filter(
      (l) => l.profileId === profile.id && l.status === 'COMPLETED',
    );
    const completedRoutineIds = new Set(
      completedLogs.map((l) => l.routineId).filter((id): id is number => id !== null),
    );

    const counts: Record<TimeWindow, { total: number; completed: number }> = {
      MORNING: { total: 0, completed: 0 },
      AFTERNOON: { total: 0, completed: 0 },
      EVENING: { total: 0, completed: 0 },
    };
    for (const w of TIME_WINDOWS) {
      const inW = scheduledToday.filter((t) => t.timeWindow === w);
      counts[w] = {
        total: inW.length,
        completed: inW.filter((t) => completedRoutineIds.has(t.id)).length,
      };
    }

    const pendingRoutines = scheduledToday
      .filter((t) => !completedRoutineIds.has(t.id))
      .map((t) => ({
        id: t.id,
        title: t.title,
        iconEmoji: t.iconEmoji,
        timeWindow: t.timeWindow,
      }));

    const pendingChores = allPersonalChores
      .filter((c) => c.profileId === profile.id && c.status === 'PENDING')
      .map((c) => ({
        id: c.id,
        title: c.title,
        iconEmoji: c.iconEmoji,
        stars: c.stars,
      }));

    const completedToday: CompletedItem[] = [
      ...completedLogs
        .filter((l): l is typeof l & { routineId: number } => l.routineId !== null)
        .map(
          (l): CompletedItem => ({
            kind: 'ROUTINE',
            id: l.routineId,
            title: l.titleSnapshot,
            iconEmoji: l.iconEmojiSnapshot,
            timeWindow: l.timeWindowSnapshot,
            completedAt: l.completedAt ?? now,
          }),
        ),
      ...allPersonalChores
        .filter(
          (c) =>
            c.profileId === profile.id &&
            c.status === 'COMPLETED' &&
            c.completedDate === logicalDate,
        )
        .map(
          (c): CompletedItem => ({
            kind: 'PERSONAL_CHORE',
            id: c.id,
            title: c.title,
            iconEmoji: c.iconEmoji,
            stars: c.stars,
            completedAt: c.completedAt ?? now,
          }),
        ),
      ...todayPoolCompletions
        .filter((p) => p.profileId === profile.id)
        .map(
          (p): CompletedItem => ({
            kind: 'POOL_COMPLETION',
            id: p.id,
            title: p.titleSnapshot,
            iconEmoji: p.iconEmojiSnapshot,
            stars: p.starsAwarded,
            completedAt: p.completedAt,
          }),
        ),
    ].sort((a, b) => b.completedAt - a.completedAt);

    return {
      id: profile.id,
      name: profile.name,
      avatarEmoji: profile.avatarEmoji,
      avatarImageUrl: profile.avatarImageUrl,
      pastelTheme: profile.pastelTheme,
      totalStars: starsByProfile.get(profile.id) ?? 0,
      rings: computeRingsFromCounts(counts, logicalDate, now),
      pendingRoutines,
      pendingChores,
      completedToday,
    };
  });

  return {
    logicalDate,
    currentWindow,
    settings,
    profiles: boardProfiles,
    poolChores: availablePoolChores,
  };
}
