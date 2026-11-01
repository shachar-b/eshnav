import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { openDatabase, type AppDb } from '../../src/db/connection.js';
import { poolChores, poolCompletions, starTransactions } from '../../src/db/schema.js';
import { createPoolChore, createProfile, deletePoolChore } from '../../src/services/admin.service.js';
import { DomainError } from '../../src/services/errors.js';
import { completePoolChore, undoPoolCompletion } from '../../src/services/pool.service.js';

const NOW = Date.UTC(2026, 10, 1, 13, 0); // 2026-11-01 15:00 Asia/Jerusalem

describe('pool.service — קופת המשימות 1-tap completion & undo', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.$client.close();
  });

  it('completes a COOLDOWN pool chore, blocks completion during cooldown, allows after expiry, and undoes cleanly', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      NOW,
    );
    const chore = createPoolChore(
      db,
      {
        title: 'סִדּוּר סָלוֹן',
        iconEmoji: '🧹',
        stars: 2,
        resetMode: 'COOLDOWN',
        cooldownMinutes: 30,
        sortOrder: 0,
        isActive: true,
      },
      NOW,
    );

    const completed = completePoolChore(db, chore.id, profile.id, NOW);
    expect(completed).toEqual({
      poolCompletionId: expect.any(Number),
      poolChoreId: chore.id,
      profileId: profile.id,
      starsAwarded: 2,
    });

    const afterComplete = db.select().from(poolChores).where(eq(poolChores.id, chore.id)).get();
    expect(afterComplete).toMatchObject({
      isActive: true,
      lastCompletedAt: NOW,
      cooldownEndsAt: NOW + 30 * 60_000,
    });

    // Rejects while cooling down
    try {
      completePoolChore(db, chore.id, profile.id, NOW + 10 * 60_000);
      expect.unreachable('expected CONFLICT while cooling down');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('CONFLICT');
    }

    // Allows completion once cooldown expires
    const second = completePoolChore(db, chore.id, profile.id, NOW + 30 * 60_000);
    expect(second.starsAwarded).toBe(2);

    // Undo the second completion clears cooldownEndsAt and writes -2 UNDO
    const undone = undoPoolCompletion(db, second.poolCompletionId, NOW + 31 * 60_000);
    expect(undone).toEqual({
      poolCompletionId: second.poolCompletionId,
      poolChoreId: chore.id,
      starsDelta: -2,
    });

    const afterUndo = db.select().from(poolChores).where(eq(poolChores.id, chore.id)).get();
    expect(afterUndo?.cooldownEndsAt).toBeNull();
    expect(db.select().from(poolCompletions).all()).toHaveLength(1);

    const ledger = db.select().from(starTransactions).all();
    expect(ledger.map((r) => ({ sourceType: r.sourceType, starsDelta: r.starsDelta }))).toEqual([
      { sourceType: 'POOL_CHORE', starsDelta: 2 },
      { sourceType: 'POOL_CHORE', starsDelta: 2 },
      { sourceType: 'UNDO', starsDelta: -2 },
    ]);
  });

  it('auto-disables an AUTO_DISABLE pool chore on completion, blocks repeat, and restores isActive=true on undo', () => {
    const profile = createProfile(
      db,
      { name: 'אִיתַי', avatarEmoji: '🦖', avatarImageUrl: null, pastelTheme: 'MINT', sortOrder: 0, isActive: true },
      NOW,
    );
    const dishwasher = createPoolChore(
      db,
      {
        title: 'פִּנּוּי מֵדִיחַ',
        iconEmoji: '🍽️',
        stars: 3,
        resetMode: 'AUTO_DISABLE',
        cooldownMinutes: 60,
        sortOrder: 0,
        isActive: true,
      },
      NOW,
    );

    const res = completePoolChore(db, dishwasher.id, profile.id, NOW);
    expect(res.starsAwarded).toBe(3);

    const disabledChore = db.select().from(poolChores).where(eq(poolChores.id, dishwasher.id)).get();
    expect(disabledChore).toMatchObject({
      isActive: false,
      cooldownEndsAt: null,
      lastCompletedAt: NOW,
    });

    // Rejects while disabled
    expect(() => completePoolChore(db, dishwasher.id, profile.id, NOW + 1_000)).toThrowError(DomainError);

    // Undo restores isActive = true and deducts 3 stars
    const undone = undoPoolCompletion(db, res.poolCompletionId, NOW + 2_000);
    expect(undone).toEqual({
      poolCompletionId: res.poolCompletionId,
      poolChoreId: dishwasher.id,
      starsDelta: -3,
    });

    const restoredChore = db.select().from(poolChores).where(eq(poolChores.id, dishwasher.id)).get();
    expect(restoredChore?.isActive).toBe(true);
    expect(db.select().from(poolCompletions).all()).toEqual([]);
  });

  it('undoes a completion gracefully even if the parent pool_chore was subsequently deleted', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      NOW,
    );
    const chore = createPoolChore(
      db,
      {
        title: 'זְרִיקַת מִחְזוּר',
        iconEmoji: '♻️',
        stars: 1,
        resetMode: 'AUTO_DISABLE',
        cooldownMinutes: 60,
        sortOrder: 0,
        isActive: true,
      },
      NOW,
    );

    const res = completePoolChore(db, chore.id, profile.id, NOW);
    deletePoolChore(db, chore.id);

    const undone = undoPoolCompletion(db, res.poolCompletionId, NOW + 500);
    expect(undone).toEqual({
      poolCompletionId: res.poolCompletionId,
      poolChoreId: null,
      starsDelta: -1,
    });
  });

  it('throws NOT_FOUND for unknown chore, profile, or completion id', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      NOW,
    );
    expect(() => completePoolChore(db, 999, profile.id, NOW)).toThrowError(DomainError);
    expect(() => undoPoolCompletion(db, 999, NOW)).toThrowError(DomainError);
  });
});
