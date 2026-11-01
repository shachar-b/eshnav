import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type AppDb } from '../../src/db/connection.js';
import { personalChores, routineDailyLogs, starTransactions } from '../../src/db/schema.js';
import { createPersonalChore, createProfile, createRoutine } from '../../src/services/admin.service.js';
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
});
