import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDb } from '../../src/db/connection.js';
import {
  adjustProfileStars,
  createPersonalChore,
  createPoolChore,
  createProfile,
  createRoutine,
} from '../../src/services/admin.service.js';
import { DomainError } from '../../src/services/errors.js';
import { getDailyHistory, togglePastRoutineStatus } from '../../src/services/history.service.js';
import { completePoolChore } from '../../src/services/pool.service.js';
import { runDailyRollover } from '../../src/services/rollover.service.js';
import { togglePersonalChore, toggleRoutineForToday } from '../../src/services/task.service.js';

const SAT_MORNING = Date.UTC(2026, 9, 31, 6, 30); // Sat 2026-10-31 08:30 IST (dow 6)
const SUN_AFTERNOON = Date.UTC(2026, 10, 1, 12, 0); // Sun 2026-11-01 14:00 IST (dow 0)

describe('history.service — daily audit rings, drill-down & parent past-routine toggle', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.$client.close();
  });

  it('returns daily stars (excluding PARENT_ADJUSTMENT), Green/Red past rings, and COMPLETED vs MISSED drill-down', () => {
    const noa = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      SAT_MORNING,
    );
    const rMorningDone = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'צִחְצוּחַ בֹּקֶר',
        iconEmoji: '🪥',
        timeWindow: 'MORNING',
        daysOfWeek: [0, 6],
        sortOrder: 0,
        isActive: true,
      },
      SAT_MORNING,
    );
    const rMorningMissed = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'סִדּוּר מִטָּה',
        iconEmoji: '🛏️',
        timeWindow: 'MORNING',
        daysOfWeek: [0, 6],
        sortOrder: 1,
        isActive: true,
      },
      SAT_MORNING,
    );
    const rEveningMissed = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'צִחְצוּחַ עֶרֶב',
        iconEmoji: '🌙',
        timeWindow: 'EVENING',
        daysOfWeek: [0, 6],
        sortOrder: 2,
        isActive: true,
      },
      SAT_MORNING,
    );

    // Saturday activity: 1 morning routine done, 1 personal chore (+3), 1 pool chore (+2), 1 parent adjustment (+10)
    toggleRoutineForToday(db, rMorningDone.id, SAT_MORNING);
    const chore = createPersonalChore(
      db,
      { profileId: noa.id, title: 'קִפּוּל כְּבִיסָה', iconEmoji: '🧺', stars: 3 },
      SAT_MORNING,
    );
    togglePersonalChore(db, chore.id, SAT_MORNING + 1_000);
    const pool = createPoolChore(
      db,
      {
        title: 'פִּנּוּי מֵדִיחַ',
        iconEmoji: '🍽️',
        stars: 2,
        resetMode: 'AUTO_DISABLE',
        cooldownMinutes: 60,
        sortOrder: 0,
        isActive: true,
      },
      SAT_MORNING,
    );
    completePoolChore(db, pool.id, noa.id, SAT_MORNING + 2_000);
    adjustProfileStars(db, noa.id, { starsDelta: 10, description: 'בונוס' }, SAT_MORNING + 3_000);

    runDailyRollover(db, '2026-10-31');

    const satHistory = getDailyHistory(db, '2026-10-31', SUN_AFTERNOON);
    expect(satHistory.logicalDate).toBe('2026-10-31');
    expect(satHistory.isToday).toBe(false);
    expect(satHistory.profiles).toHaveLength(1);

    const p = satHistory.profiles[0]!;
    expect(p.totalStars).toBe(15); // 3 + 2 + 10
    expect(p.starsEarnedThatDay).toBe(5); // 3 + 2 (parent adjustment excluded)
    expect(p.rings.MORNING).toEqual({
      totalScheduled: 2,
      completedCount: 1,
      redMissedCount: 1,
      greyRemainingCount: 0,
      isWindowElapsed: true,
    });
    expect(p.rings.AFTERNOON).toEqual({
      totalScheduled: 0,
      completedCount: 0,
      redMissedCount: 0,
      greyRemainingCount: 0,
      isWindowElapsed: true,
    });
    expect(p.rings.EVENING).toEqual({
      totalScheduled: 1,
      completedCount: 0,
      redMissedCount: 1,
      greyRemainingCount: 0,
      isWindowElapsed: true,
    });

    expect(p.routines.map((r) => ({ id: r.routineId, status: r.status }))).toEqual([
      { id: rMorningDone.id, status: 'COMPLETED' },
      { id: rMorningMissed.id, status: 'MISSED' },
      { id: rEveningMissed.id, status: 'MISSED' },
    ]);
    expect(p.chores.map((c) => ({ kind: c.kind, stars: c.stars }))).toEqual([
      { kind: 'PERSONAL_CHORE', stars: 3 },
      { kind: 'POOL_COMPLETION', stars: 2 },
    ]);
  });

  it('allows parents to toggle past routine status COMPLETED <-> MISSED and rejects today/future dates', () => {
    const noa = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      SAT_MORNING,
    );
    const routine = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'צִחְצוּחַ בֹּקֶר',
        iconEmoji: '🪥',
        timeWindow: 'MORNING',
        daysOfWeek: [0, 6],
        sortOrder: 0,
        isActive: true,
      },
      SAT_MORNING,
    );
    runDailyRollover(db, '2026-10-31');

    // Flip MISSED -> COMPLETED
    const toCompleted = togglePastRoutineStatus(db, routine.id, '2026-10-31', SUN_AFTERNOON);
    expect(toCompleted).toEqual({
      routineId: routine.id,
      logicalDate: '2026-10-31',
      status: 'COMPLETED',
    });
    expect(getDailyHistory(db, '2026-10-31', SUN_AFTERNOON).profiles[0]?.rings.MORNING.completedCount).toBe(1);

    // Flip COMPLETED -> MISSED
    const toMissed = togglePastRoutineStatus(db, routine.id, '2026-10-31', SUN_AFTERNOON);
    expect(toMissed).toEqual({
      routineId: routine.id,
      logicalDate: '2026-10-31',
      status: 'MISSED',
    });
    expect(getDailyHistory(db, '2026-10-31', SUN_AFTERNOON).profiles[0]?.rings.MORNING.redMissedCount).toBe(1);

    // Rejects today (CONFLICT 409) in history parent toggle
    try {
      togglePastRoutineStatus(db, routine.id, '2026-11-01', SUN_AFTERNOON);
      expect.unreachable('should reject today');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('CONFLICT');
    }

    // Rejects future date in getDailyHistory (VALIDATION_ERROR 400)
    try {
      getDailyHistory(db, '2026-11-02', SUN_AFTERNOON);
      expect.unreachable('should reject future date');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('VALIDATION_ERROR');
    }
  });
});
