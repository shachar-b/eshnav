import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type AppDb } from '../../src/db/connection.js';
import { routineDailyLogs } from '../../src/db/schema.js';
import { createProfile, createRoutine } from '../../src/services/admin.service.js';
import { runCatchUpRollover, runDailyRollover } from '../../src/services/rollover.service.js';
import { toggleRoutineForToday } from '../../src/services/task.service.js';

const DAY_THU = Date.UTC(2026, 9, 29, 7, 0); // Thu 2026-10-29 09:00 IST (dow 4)
const DAY_SUN = Date.UTC(2026, 10, 1, 7, 0); // Sun 2026-11-01 09:00 IST (dow 0)

describe('rollover.service — idempotent daily rollover & boot catch-up', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.$client.close();
  });

  it('writes MISSED snapshots only for uncompleted scheduled active routines and is 100% idempotent', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      DAY_THU,
    );
    // Scheduled Thu (4)
    const doneRoutine = createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'לְצַחְצֵחַ שִׁנַּיִם',
        iconEmoji: '🪥',
        timeWindow: 'MORNING',
        daysOfWeek: [0, 1, 2, 3, 4, 5],
        sortOrder: 0,
        isActive: true,
      },
      DAY_THU,
    );
    const missedRoutine = createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'לְסַדֵּר תִּיק',
        iconEmoji: '🎒',
        timeWindow: 'EVENING',
        daysOfWeek: [4],
        sortOrder: 1,
        isActive: true,
      },
      DAY_THU,
    );
    // Not scheduled on Thursday (Shabbat = 6)
    createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'קִדּוּשׁ',
        iconEmoji: '🍷',
        timeWindow: 'EVENING',
        daysOfWeek: [6],
        sortOrder: 2,
        isActive: true,
      },
      DAY_THU,
    );
    // Inactive routine on Thursday
    createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'מְכֻבֶּה',
        iconEmoji: '💤',
        timeWindow: 'MORNING',
        daysOfWeek: [4],
        sortOrder: 3,
        isActive: false,
      },
      DAY_THU,
    );

    // Complete doneRoutine on Thursday
    toggleRoutineForToday(db, doneRoutine.id, DAY_THU);

    // Run rollover for Thursday twice
    const insertedFirst = runDailyRollover(db, '2026-10-29');
    const insertedSecond = runDailyRollover(db, '2026-10-29');
    expect(insertedFirst).toBe(1);
    expect(insertedSecond).toBe(0);

    const logs = db
      .select()
      .from(routineDailyLogs)
      .where(eq(routineDailyLogs.logicalDate, '2026-10-29'))
      .all();
    expect(logs).toHaveLength(2);
    expect(logs.find((l) => l.routineId === doneRoutine.id)?.status).toBe('COMPLETED');
    expect(logs.find((l) => l.routineId === missedRoutine.id)).toMatchObject({
      status: 'MISSED',
      titleSnapshot: 'לְסַדֵּר תִּיק',
      iconEmojiSnapshot: '🎒',
      timeWindowSnapshot: 'EVENING',
      completedAt: null,
    });
  });

  it('catches up multiple offline past days on boot without sealing today or days before routine creation', () => {
    const profile = createProfile(
      db,
      { name: 'אִיתַי', avatarEmoji: '🦖', avatarImageUrl: null, pastelTheme: 'MINT', sortOrder: 0, isActive: true },
      DAY_THU,
    );
    // Created Thursday 2026-10-29, scheduled every day [0..6]
    const daily = createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'לְצַחְצֵחַ שִׁנַּיִם',
        iconEmoji: '🪥',
        timeWindow: 'MORNING',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        sortOrder: 0,
        isActive: true,
      },
      DAY_THU,
    );
    // Created Saturday 2026-10-31
    const satCreated = createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'קְרִיאַת סֵפֶר',
        iconEmoji: '📚',
        timeWindow: 'EVENING',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        sortOrder: 1,
        isActive: true,
      },
      Date.UTC(2026, 9, 31, 8, 0),
    );

    // Boot on Sunday 2026-11-01 -> seals Thu 10-29, Fri 10-30, Sat 10-31 (not Sun 11-01)
    const count = runCatchUpRollover(db, DAY_SUN);
    expect(count).toBe(4); // 3 days for `daily` + 1 day (Sat) for `satCreated`
    expect(runCatchUpRollover(db, DAY_SUN)).toBe(0);

    const allLogs = db.select().from(routineDailyLogs).all();
    expect(allLogs.filter((l) => l.routineId === daily.id).map((l) => l.logicalDate).sort()).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
    ]);
    expect(allLogs.filter((l) => l.routineId === satCreated.id).map((l) => l.logicalDate)).toEqual(['2026-10-31']);
  });
});
