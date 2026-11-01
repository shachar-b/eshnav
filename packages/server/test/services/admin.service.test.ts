import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDb } from '../../src/db/connection.js';
import { DomainError } from '../../src/services/errors.js';
import {
  PinRateLimiter,
  adjustProfileStars,
  createAdminSessionToken,
  createPersonalChore,
  createPoolChore,
  createProfile,
  createRoutine,
  deletePersonalChore,
  deletePoolChore,
  deleteProfile,
  deleteRoutine,
  ensureAppSettings,
  getPublicSettings,
  listPersonalChores,
  listPoolChores,
  listProfiles,
  listRoutines,
  resetPoolChoreCooldown,
  resolveSessionSecret,
  togglePoolChoreActive,
  unlockParentAdmin,
  updateAppSettings,
  updatePersonalChore,
  updatePoolChore,
  updateProfile,
  updateRoutine,
  verifyAdminSessionToken,
} from '../../src/services/admin.service.js';

const NOW = Date.UTC(2026, 10, 1, 8, 0); // 2026-11-01 10:00 Asia/Jerusalem
const SECRET = 'a'.repeat(32);

describe('admin.service — settings, PIN, and session security', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.$client.close();
  });

  it('bootstraps singleton app_settings with hashed default PIN 1234 and never exposes parentPinHash', () => {
    const row = ensureAppSettings(db, '1234', NOW);
    expect(row.id).toBe(1);
    expect(row.appTitle).toBe('הבית שלנו');
    expect(row.parentPinHash).not.toBe('1234');
    expect(row.parentPinHash.startsWith('scrypt:')).toBe(true);

    // Idempotent on second call
    const second = ensureAppSettings(db, '9999', NOW + 1000);
    expect(second.parentPinHash).toBe(row.parentPinHash);

    const pub = getPublicSettings(db, NOW);
    expect(pub).toEqual({
      appTitle: 'הבית שלנו',
      announcementEnabled: false,
      announcementText: null,
      announcementEmoji: '📣',
      soundEnabled: true,
    });
    expect('parentPinHash' in pub).toBe(false);
  });

  it('verifies correct PIN, issues a signed session token, and rejects wrong PIN with INVALID_PIN', () => {
    ensureAppSettings(db, '1234', NOW);

    const { token } = unlockParentAdmin(db, '1234', SECRET, NOW);
    expect(verifyAdminSessionToken(token, SECRET, NOW + 60_000)).toBe(true);
    expect(verifyAdminSessionToken(`${token}tampered`, SECRET, NOW + 60_000)).toBe(false);
    expect(verifyAdminSessionToken(token, 'b'.repeat(32), NOW + 60_000)).toBe(false);
    // Expired after 2 hours
    expect(verifyAdminSessionToken(token, SECRET, NOW + 3 * 60 * 60_000)).toBe(false);

    expect(() => unlockParentAdmin(db, '0000', SECRET, NOW)).toThrowError(DomainError);
    try {
      unlockParentAdmin(db, '0000', SECRET, NOW);
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe('INVALID_PIN');
      expect((err as DomainError).statusCode).toBe(401);
    }
  });

  it('rate-limits repeated failed PIN attempts and resets after window or valid login', () => {
    ensureAppSettings(db, '1234', NOW);
    const limiter = new PinRateLimiter(3, 60_000);

    for (let i = 0; i < 3; i++) {
      expect(() => unlockParentAdmin(db, '0000', SECRET, NOW, limiter, '127.0.0.1')).toThrowError(/שגוי/);
    }
    try {
      unlockParentAdmin(db, '1234', SECRET, NOW + 1_000, limiter, '127.0.0.1');
      expect.unreachable('should have rate-limited');
    } catch (err) {
      expect((err as DomainError).code).toBe('RATE_LIMITED');
      expect((err as DomainError).statusCode).toBe(429);
    }

    // After cooldown window passes, valid PIN succeeds
    const { token } = unlockParentAdmin(db, '1234', SECRET, NOW + 61_000, limiter, '127.0.0.1');
    expect(verifyAdminSessionToken(token, SECRET, NOW + 61_000)).toBe(true);
  });

  it('updates app settings and rotates the parent PIN', () => {
    ensureAppSettings(db, '1234', NOW);
    const updated = updateAppSettings(
      db,
      {
        appTitle: 'משפחת כהן',
        announcementEnabled: true,
        announcementText: 'היום הולכים לבריכה!',
        announcementEmoji: '🏊',
        soundEnabled: false,
        newParentPin: '5678',
      },
      NOW + 500,
    );

    expect(updated).toEqual({
      appTitle: 'משפחת כהן',
      announcementEnabled: true,
      announcementText: 'היום הולכים לבריכה!',
      announcementEmoji: '🏊',
      soundEnabled: false,
    });

    expect(() => unlockParentAdmin(db, '1234', SECRET, NOW + 600)).toThrowError(DomainError);
    expect(unlockParentAdmin(db, '5678', SECRET, NOW + 600).token).toBeTruthy();
  });

  it('fails fast in production when SESSION_SECRET is missing or shorter than 32 chars', () => {
    expect(() => resolveSessionSecret({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    expect(() => resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: 'short-secret' })).toThrow(/SESSION_SECRET/);
    expect(resolveSessionSecret({ NODE_ENV: 'production', SESSION_SECRET: SECRET })).toBe(SECRET);
    expect(resolveSessionSecret({ NODE_ENV: 'test' }).length).toBeGreaterThanOrEqual(32);
  });

  it('rejects malformed session tokens cleanly', () => {
    const token = createAdminSessionToken(SECRET, NOW, 10_000);
    expect(verifyAdminSessionToken(token, SECRET, NOW + 5_000)).toBe(true);
    expect(verifyAdminSessionToken(undefined, SECRET, NOW)).toBe(false);
    expect(verifyAdminSessionToken('not.a.valid.token', SECRET, NOW)).toBe(false);
    expect(verifyAdminSessionToken('abc.def.123', SECRET, NOW)).toBe(false);
  });
});

describe('admin.service — profiles, routines, personal chores & pool chores CRUD', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.$client.close();
  });

  it('manages child profiles and manual PARENT_ADJUSTMENT star adjustments', () => {
    const p1 = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 1, isActive: true },
      NOW,
    );
    const p2 = createProfile(
      db,
      { name: 'אִיתַי', avatarEmoji: '🦖', avatarImageUrl: null, pastelTheme: 'MINT', sortOrder: 0, isActive: true },
      NOW,
    );

    expect(listProfiles(db).map((p) => p.id)).toEqual([p2.id, p1.id]);

    const patched = updateProfile(db, p1.id, { pastelTheme: 'CORAL', name: 'נועה' });
    expect(patched.pastelTheme).toBe('CORAL');
    expect(patched.name).toBe('נועה');

    const adj1 = adjustProfileStars(db, p1.id, { starsDelta: 5, description: 'בונוס שבת' }, NOW);
    expect(adj1).toEqual({ profileId: p1.id, totalStars: 5 });
    const adj2 = adjustProfileStars(db, p1.id, { starsDelta: -2 }, NOW);
    expect(adj2).toEqual({ profileId: p1.id, totalStars: 3 });

    deleteProfile(db, p2.id);
    expect(listProfiles(db).map((p) => p.id)).toEqual([p1.id]);
    expect(() => updateProfile(db, 999, { name: 'אין' })).toThrowError(DomainError);
  });

  it('manages routine templates with daysOfWeek mapping', () => {
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
        daysOfWeek: [0, 1, 2, 3, 4, 5],
        sortOrder: 0,
        isActive: true,
      },
      NOW,
    );
    expect(routine.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5]);
    expect(listRoutines(db)).toHaveLength(1);

    const updated = updateRoutine(db, routine.id, { timeWindow: 'EVENING', daysOfWeek: [0, 6] });
    expect(updated.timeWindow).toBe('EVENING');
    expect(updated.daysOfWeek).toEqual([0, 6]);

    deleteRoutine(db, routine.id);
    expect(listRoutines(db)).toEqual([]);
  });

  it('manages personal chores and computes issuedDate in Asia/Jerusalem', () => {
    const profile = createProfile(
      db,
      { name: 'נוֹעָה', avatarEmoji: '🦄', avatarImageUrl: null, pastelTheme: 'SKY', sortOrder: 0, isActive: true },
      NOW,
    );
    const lateUtc = Date.UTC(2026, 10, 1, 22, 30); // 2026-11-02 00:30 IST
    const chore = createPersonalChore(
      db,
      { profileId: profile.id, title: 'לְסַדֵּר חֶדֶר', iconEmoji: '🧸', stars: 3 },
      lateUtc,
    );
    expect(chore.issuedDate).toBe('2026-11-02');
    expect(chore.status).toBe('PENDING');

    const edited = updatePersonalChore(db, chore.id, { stars: 4 });
    expect(edited.stars).toBe(4);
    expect(listPersonalChores(db)).toHaveLength(1);

    deletePersonalChore(db, chore.id);
    expect(listPersonalChores(db)).toEqual([]);
  });

  it('manages pool chores including 1-tap toggleActive and resetCooldown', () => {
    const pool = createPoolChore(
      db,
      {
        title: 'פִּנּוּי מֵדִיחַ',
        iconEmoji: '🍽️',
        stars: 2,
        resetMode: 'COOLDOWN',
        cooldownMinutes: 60,
        sortOrder: 0,
        isActive: false,
      },
      NOW,
    );
    expect(pool.isActive).toBe(false);

    const enabled = togglePoolChoreActive(db, pool.id, true);
    expect(enabled.isActive).toBe(true);

    // Simulate an active cooldown while in COOLDOWN mode, then switch resetMode to AUTO_DISABLE -> must clear orphaned cooldownEndsAt
    db.$client.prepare('UPDATE pool_chores SET cooldownEndsAt = ? WHERE id = ?').run(NOW + 60_000, pool.id);
    const updated = updatePoolChore(db, pool.id, { stars: 3, resetMode: 'AUTO_DISABLE' });
    expect(updated.stars).toBe(3);
    expect(updated.resetMode).toBe('AUTO_DISABLE');
    expect(updated.cooldownEndsAt).toBeNull();

    // Simulate an active cooldown and clear it explicitly
    db.$client.prepare('UPDATE pool_chores SET cooldownEndsAt = ? WHERE id = ?').run(NOW + 60_000, pool.id);
    const reset = resetPoolChoreCooldown(db, pool.id);
    expect(reset.cooldownEndsAt).toBeNull();

    expect(listPoolChores(db)).toHaveLength(1);
    deletePoolChore(db, pool.id);
    expect(listPoolChores(db)).toEqual([]);
  });
});
