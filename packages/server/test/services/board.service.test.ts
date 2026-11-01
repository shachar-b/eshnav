import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BoardResponseSchema } from '@eshnav/shared';
import { openDatabase, type AppDb } from '../../src/db/connection.js';
import {
  createPersonalChore,
  createPoolChore,
  createProfile,
  createRoutine,
  ensureAppSettings,
} from '../../src/services/admin.service.js';
import { getFamilyBoard } from '../../src/services/board.service.js';
import { completePoolChore } from '../../src/services/pool.service.js';
import { togglePersonalChore, toggleRoutineForToday } from '../../src/services/task.service.js';

const SAT_NOON = Date.UTC(2026, 9, 31, 10, 0); // Sat 2026-10-31 12:00 IST
const SUN_AFTERNOON = Date.UTC(2026, 10, 1, 12, 0); // Sun 2026-11-01 14:00 IST (dow 0)
const SUN_EVENING = Date.UTC(2026, 10, 1, 16, 30); // Sun 2026-11-01 18:30 IST (dow 0)

describe('board.service — Skylight board state & dual-color ring calculation', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
    ensureAppSettings(db, '1234', SAT_NOON);
  });

  afterEach(() => {
    db.$client.close();
  });

  it('computes elapsed Red/Green vs active Grey/Green rings, rollover personal chores, completed drawer & available pool chores', () => {
    const noa = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      SAT_NOON,
    );
    // Inactive profile must not appear on board
    createProfile(
      db,
      { name: 'אורח', avatarEmoji: '🐼', avatarImageUrl: null, pastelTheme: 'ROSE', sortOrder: 1, isActive: false },
      SAT_NOON,
    );

    // Morning routines on Sunday (dow 0): 1 completed, 1 unfinished -> at 14:00 MORNING is elapsed -> redMissedCount = 1!
    const mDone = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'צִחְצוּחַ שִׁנַּיִם',
        iconEmoji: '🪥',
        timeWindow: 'MORNING',
        daysOfWeek: [0, 1, 2, 3, 4, 5],
        sortOrder: 0,
        isActive: true,
      },
      SAT_NOON,
    );
    const mOverdue = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'סִדּוּר מִטָּה',
        iconEmoji: '🛏️',
        timeWindow: 'MORNING',
        daysOfWeek: [0],
        sortOrder: 1,
        isActive: true,
      },
      SAT_NOON,
    );

    // Afternoon routine on Sunday: unfinished -> at 14:00 AFTERNOON is NOT elapsed -> greyRemainingCount = 1!
    const aPending = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'שִׁעוּרֵי בַּיִת',
        iconEmoji: '📚',
        timeWindow: 'AFTERNOON',
        daysOfWeek: [0],
        sortOrder: 0,
        isActive: true,
      },
      SAT_NOON,
    );

    // Evening routine on Sunday: unfinished -> greyRemainingCount = 1
    const ePending = createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'מִקְלַחַת',
        iconEmoji: '🚿',
        timeWindow: 'EVENING',
        daysOfWeek: [0],
        sortOrder: 0,
        isActive: true,
      },
      SAT_NOON,
    );

    // Shabbat-only routine must NOT count on Sunday
    createRoutine(
      db,
      {
        profileId: noa.id,
        title: 'קִדּוּשׁ',
        iconEmoji: '🍷',
        timeWindow: 'EVENING',
        daysOfWeek: [6],
        sortOrder: 1,
        isActive: true,
      },
      SAT_NOON,
    );

    // Personal chore issued yesterday (Saturday) that is still PENDING must roll over onto Sunday's board!
    const rolledOverChore = createPersonalChore(
      db,
      { profileId: noa.id, title: 'לְסַדֵּר חֶדֶר', iconEmoji: '🧸', stars: 2 },
      SAT_NOON,
    );
    // Personal chore completed today
    const doneTodayChore = createPersonalChore(
      db,
      { profileId: noa.id, title: 'קִפּוּל כְּבִיסָה', iconEmoji: '🧺', stars: 3 },
      SUN_AFTERNOON - 60_000,
    );
    togglePersonalChore(db, doneTodayChore.id, SUN_AFTERNOON - 30_000);

    // Complete 1 morning routine today
    toggleRoutineForToday(db, mDone.id, SUN_AFTERNOON - 50_000);

    // Pool chores: 1 available, 1 completed AUTO_DISABLE, 1 cooling down (30m)
    const poolAvailable = createPoolChore(
      db,
      {
        title: 'זְרִיקַת מִחְזוּר',
        iconEmoji: '♻️',
        stars: 1,
        resetMode: 'COOLDOWN',
        cooldownMinutes: 60,
        sortOrder: 0,
        isActive: true,
      },
      SAT_NOON,
    );
    const poolAutoDisable = createPoolChore(
      db,
      {
        title: 'פִּנּוּי מֵדִיחַ',
        iconEmoji: '🍽️',
        stars: 2,
        resetMode: 'AUTO_DISABLE',
        cooldownMinutes: 60,
        sortOrder: 1,
        isActive: true,
      },
      SAT_NOON,
    );
    const poolCooldown = createPoolChore(
      db,
      {
        title: 'סִדּוּר סָלוֹן',
        iconEmoji: '🧹',
        stars: 2,
        resetMode: 'COOLDOWN',
        cooldownMinutes: 30,
        sortOrder: 2,
        isActive: true,
      },
      SAT_NOON,
    );

    const autoCompletion = completePoolChore(db, poolAutoDisable.id, noa.id, SUN_AFTERNOON - 20_000);
    completePoolChore(db, poolCooldown.id, noa.id, SUN_AFTERNOON - 10_000);

    const board = getFamilyBoard(db, SUN_AFTERNOON);
    // Must validate cleanly against the shared Zod contract
    expect(BoardResponseSchema.parse(board)).toEqual(board);

    expect(board.logicalDate).toBe('2026-11-01');
    expect(board.currentWindow).toBe('AFTERNOON');
    expect('parentPinHash' in board.settings).toBe(false);
    expect(board.profiles).toHaveLength(1);

    const p = board.profiles[0]!;
    expect(p.totalStars).toBe(7); // 3 (personal) + 2 (auto pool) + 2 (cooldown pool)
    expect(p.rings).toEqual({
      MORNING: {
        totalScheduled: 2,
        completedCount: 1,
        redMissedCount: 1,
        greyRemainingCount: 0,
        isWindowElapsed: true,
      },
      AFTERNOON: {
        totalScheduled: 1,
        completedCount: 0,
        redMissedCount: 0,
        greyRemainingCount: 1,
        isWindowElapsed: false,
      },
      EVENING: {
        totalScheduled: 1,
        completedCount: 0,
        redMissedCount: 0,
        greyRemainingCount: 1,
        isWindowElapsed: false,
      },
    });

    expect(p.pendingRoutines.map((r) => r.id)).toEqual([mOverdue.id, aPending.id, ePending.id]);
    expect(p.pendingChores.map((c) => c.id)).toEqual([rolledOverChore.id]);
    expect(p.completedToday).toHaveLength(4); // mDone, doneTodayChore, autoCompletion, cooldownCompletion
    expect(p.completedToday.find((i) => i.kind === 'ROUTINE')?.id).toBe(mDone.id);
    expect(p.completedToday.find((i) => i.kind === 'PERSONAL_CHORE')?.id).toBe(doneTodayChore.id);
    expect(p.completedToday.some((i) => i.kind === 'POOL_COMPLETION' && i.id === autoCompletion.poolCompletionId)).toBe(
      true,
    );

    // Only poolAvailable is shown right now (poolAutoDisable is inactive, poolCooldown is cooling down)
    expect(board.poolChores.map((c) => c.id)).toEqual([poolAvailable.id]);

    // Fast-forward to 18:30 (EVENING): AFTERNOON ring is now elapsed (redMissedCount = 1), and 30m poolCooldown has expired so it reappears!
    const eveningBoard = getFamilyBoard(db, SUN_EVENING);
    expect(eveningBoard.currentWindow).toBe('EVENING');
    expect(eveningBoard.profiles[0]?.rings.AFTERNOON).toEqual({
      totalScheduled: 1,
      completedCount: 0,
      redMissedCount: 1,
      greyRemainingCount: 0,
      isWindowElapsed: true,
    });
    expect(eveningBoard.profiles[0]?.rings.EVENING.isWindowElapsed).toBe(false);
    expect(eveningBoard.poolChores.map((c) => c.id)).toEqual([poolAvailable.id, poolCooldown.id]);
  });
});
