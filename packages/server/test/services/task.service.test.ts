import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type AppDb } from '../../src/db/connection.js';
import { personalChores, routineDailyLogs, starTransactions } from '../../src/db/schema.js';
import {
  createPersonalChore,
  createProfile,
  createRoutine,
  updatePersonalChore,
} from '../../src/services/admin.service.js';
import { DomainError } from '../../src/services/errors.js';
import { togglePersonalChore, toggleRoutineForToday } from '../../src/services/task.service.js';

const NOW = Date.UTC(2026, 10, 1, 6, 15); // 2026-11-01 08:15 Asia/Jerusalem

describe('task.service — routine & personal chore completion and 1-tap undo', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.$client.close();
  });

  it('completes a routine for today with snapshot fields and 0 stars, then deletes the log row on uncheck', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      NOW,
    );
    const routine = createRoutine(
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
      NOW,
    );

    const completed = toggleRoutineForToday(db, routine.id, NOW);
    expect(completed).toEqual({
      routineId: routine.id,
      logicalDate: '2026-11-01',
      isCompleted: true,
    });

    const logs = db.select().from(routineDailyLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      routineId: routine.id,
      profileId: profile.id,
      titleSnapshot: 'לְצַחְצֵחַ שִׁנַּיִם',
      iconEmojiSnapshot: '🪥',
      timeWindowSnapshot: 'MORNING',
      logicalDate: '2026-11-01',
      status: 'COMPLETED',
      completedAt: NOW,
    });
    expect(db.select().from(starTransactions).all()).toEqual([]);

    // 1-tap undo deletes today's COMPLETED log row
    const unchecked = toggleRoutineForToday(db, routine.id, NOW + 5_000);
    expect(unchecked).toEqual({
      routineId: routine.id,
      logicalDate: '2026-11-01',
      isCompleted: false,
    });
    expect(db.select().from(routineDailyLogs).all()).toEqual([]);
  });

  it('completes a personal chore (+N stars) and atomically compensates (-N UNDO) on uncheck', () => {
    const profile = createProfile(
      db,
      { name: 'אִיתַי', avatarEmoji: '🦖', avatarImageUrl: null, pastelTheme: 'MINT', sortOrder: 0, isActive: true },
      NOW,
    );
    const chore = createPersonalChore(
      db,
      { profileId: profile.id, title: 'לְסַדֵּר חֶדֶר', iconEmoji: '🧸', stars: 3 },
      NOW,
    );

    const res1 = togglePersonalChore(db, chore.id, NOW + 1_000);
    expect(res1).toEqual({ choreId: chore.id, status: 'COMPLETED', starsDelta: 3 });

    const storedCompleted = db.select().from(personalChores).where(eq(personalChores.id, chore.id)).get();
    expect(storedCompleted).toMatchObject({
      status: 'COMPLETED',
      completedDate: '2026-11-01',
      completedAt: NOW + 1_000,
    });

    const res2 = togglePersonalChore(db, chore.id, NOW + 2_000);
    expect(res2).toEqual({ choreId: chore.id, status: 'PENDING', starsDelta: -3 });

    const storedPending = db.select().from(personalChores).where(eq(personalChores.id, chore.id)).get();
    expect(storedPending).toMatchObject({
      status: 'PENDING',
      completedDate: null,
      completedAt: null,
    });

    const ledger = db.select().from(starTransactions).all();
    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toMatchObject({
      profileId: profile.id,
      sourceType: 'PERSONAL_CHORE',
      sourceId: chore.id,
      starsDelta: 3,
      logicalDate: '2026-11-01',
    });
    expect(ledger[1]).toMatchObject({
      profileId: profile.id,
      sourceType: 'UNDO',
      sourceId: chore.id,
      starsDelta: -3,
      logicalDate: '2026-11-01',
    });
  });

  it('does not insert zero-star ledger entries when toggling a 0-star personal chore', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      NOW,
    );
    const chore = createPersonalChore(
      db,
      { profileId: profile.id, title: 'לְהָכִין תִּיק חוּג', iconEmoji: '🎒', stars: 0 },
      NOW,
    );

    expect(togglePersonalChore(db, chore.id, NOW)).toEqual({
      choreId: chore.id,
      status: 'COMPLETED',
      starsDelta: 0,
    });
    expect(togglePersonalChore(db, chore.id, NOW + 100)).toEqual({
      choreId: chore.id,
      status: 'PENDING',
      starsDelta: 0,
    });
    expect(db.select().from(starTransactions).all()).toEqual([]);
  });

  it('throws NOT_FOUND when routine or personal chore does not exist', () => {
    expect(() => toggleRoutineForToday(db, 999, NOW)).toThrowError(DomainError);
    expect(() => togglePersonalChore(db, 999, NOW)).toThrowError(DomainError);
  });

  it('rejects cross-day uncheck of a past completed personal chore and compensates exact awarded stars if edited same-day', () => {
    const profile = createProfile(
      db,
      { name: 'אִיתַי', avatarEmoji: '🦖', avatarImageUrl: null, pastelTheme: 'MINT', sortOrder: 0, isActive: true },
      NOW,
    );
    const chore = createPersonalChore(
      db,
      { profileId: profile.id, title: 'לְסַדֵּר חֶדֶר', iconEmoji: '🧸', stars: 2 },
      NOW,
    );

    // Complete at stars=2, then parent edits chore stars to 5, then kid undoes same-day -> must deduct -2 (not -5!)
    togglePersonalChore(db, chore.id, NOW + 1_000);
    updatePersonalChore(db, chore.id, { stars: 5 });
    const sameDayUndo = togglePersonalChore(db, chore.id, NOW + 2_000);
    expect(sameDayUndo).toEqual({ choreId: chore.id, status: 'PENDING', starsDelta: -2 });

    // Re-complete at stars=5 on 2026-11-01, then attempt uncheck on 2026-11-02 -> must reject with CONFLICT
    togglePersonalChore(db, chore.id, NOW + 3_000);
    const nextDay = Date.UTC(2026, 10, 2, 7, 0); // 2026-11-02 09:00 IST
    try {
      togglePersonalChore(db, chore.id, nextDay);
      expect.unreachable('expected CONFLICT on cross-day personal chore uncheck');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('CONFLICT');
    }

    const row = db.select().from(personalChores).where(eq(personalChores.id, chore.id)).get();
    expect(row?.status).toBe('COMPLETED');
    expect(row?.completedDate).toBe('2026-11-01');
  });

  it('rejects completing an inactive or unscheduled routine today', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      NOW,
    );
    // NOW is Sunday (dow 0); Shabbat-only routine (dow 6) must not be completable today
    const shabbatOnly = createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'קִדּוּשׁ',
        iconEmoji: '🍷',
        timeWindow: 'EVENING',
        daysOfWeek: [6],
        sortOrder: 0,
        isActive: true,
      },
      NOW,
    );
    const inactive = createRoutine(
      db,
      {
        profileId: profile.id,
        title: 'מְכֻבֶּה',
        iconEmoji: '💤',
        timeWindow: 'MORNING',
        daysOfWeek: [0],
        sortOrder: 1,
        isActive: false,
      },
      NOW,
    );

    expect(() => toggleRoutineForToday(db, shabbatOnly.id, NOW)).toThrowError(DomainError);
    expect(() => toggleRoutineForToday(db, inactive.id, NOW)).toThrowError(DomainError);
    expect(db.select().from(routineDailyLogs).all()).toEqual([]);
  });
});
