import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import {
  getLogicalDateString,
  type AdjustStarsBody,
  type AdjustStarsResponse,
  type CreatePersonalChoreBody,
  type CreatePoolChoreBody,
  type CreateProfileBody,
  type CreateRoutineBody,
  type PersonalChore,
  type PoolChore,
  type Profile,
  type PublicSettings,
  type RoutineTemplate,
  type UpdatePersonalChoreBody,
  type UpdatePoolChoreBody,
  type UpdateProfileBody,
  type UpdateRoutineBody,
  type UpdateSettingsBody,
} from '@eshnav/shared';
import type { AppDb } from '../db/connection.js';
import {
  appSettings,
  personalChores,
  poolChores,
  profiles,
  routineTemplates,
  starTransactions,
} from '../db/schema.js';
import { DomainError } from './errors.js';

const DEV_FALLBACK_SECRET = 'eshnav-local-dev-session-secret-not-for-production';
const DEFAULT_SESSION_TTL_MS = 2 * 60 * 60_000; // 2 hours

// ─── PIN Crypto & Session Signing ──────────────────────────────────────────────

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPinHash(pin: string, stored: string): boolean {
  const [prefix, salt, expectedHex] = stored.split(':');
  if (prefix !== 'scrypt' || !salt || !expectedHex || !/^[0-9a-f]+$/i.test(expectedHex) || expectedHex.length % 2 !== 0) {
    return false;
  }
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = scryptSync(pin, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function resolveSessionSecret(env: Record<string, string | undefined> = process.env): string {
  const secret = env.SESSION_SECRET?.trim();
  if (env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('SESSION_SECRET environment variable (>= 32 chars) is required in NODE_ENV=production');
    }
    return secret;
  }
  return secret && secret.length >= 32 ? secret : DEV_FALLBACK_SECRET;
}

export function createAdminSessionToken(
  secret: string,
  now: number = Date.now(),
  ttlMs: number = DEFAULT_SESSION_TTL_MS,
): string {
  const expiresAt = now + ttlMs;
  const payload = `${now}.${expiresAt}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  now: number = Date.now(),
): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [issuedStr, expiresStr, sigHex] = parts;
  if (
    !issuedStr ||
    !expiresStr ||
    !sigHex ||
    !/^\d+$/.test(issuedStr) ||
    !/^\d+$/.test(expiresStr) ||
    !/^[0-9a-f]{64}$/i.test(sigHex)
  ) {
    return false;
  }
  const expiresAt = Number(expiresStr);
  if (!Number.isFinite(expiresAt) || now >= expiresAt) return false;

  const expectedHex = createHmac('sha256', secret).update(`${issuedStr}.${expiresStr}`).digest('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(sigHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Simple sliding-window in-memory brute-force limiter for the 4-digit Parent PIN. */
export class PinRateLimiter {
  private readonly attempts = new Map<string, { count: number; windowStart: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 60_000,
  ) {}

  assertAllowed(key: string, now: number): void {
    const entry = this.attempts.get(key);
    if (!entry) return;
    if (now - entry.windowStart >= this.windowMs) {
      this.attempts.delete(key);
      return;
    }
    if (entry.count >= this.maxFailures) {
      throw new DomainError('RATE_LIMITED', 'יותר מדי ניסיונות שגויים. נסו שוב בעוד דקה.');
    }
  }

  recordFailure(key: string, now: number): void {
    const entry = this.attempts.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.attempts.set(key, { count: 1, windowStart: now });
    } else {
      entry.count += 1;
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

// ─── Settings & Unlock ─────────────────────────────────────────────────────────

function toPublicSettings(row: typeof appSettings.$inferSelect): PublicSettings {
  return {
    appTitle: row.appTitle,
    announcementEnabled: row.announcementEnabled,
    announcementText: row.announcementText,
    announcementEmoji: row.announcementEmoji,
    soundEnabled: row.soundEnabled,
  };
}

export function ensureAppSettings(db: AppDb, defaultPin = '1234', now: number = Date.now()) {
  const existing = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (existing) return existing;
  db.insert(appSettings)
    .values({ id: 1, parentPinHash: hashPin(defaultPin), updatedAt: now })
    .onConflictDoNothing()
    .run();
  const created = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  if (!created) throw new DomainError('INTERNAL_ERROR', 'Failed to initialize app_settings');
  return created;
}

export function getPublicSettings(db: AppDb, now: number = Date.now()): PublicSettings {
  return toPublicSettings(ensureAppSettings(db, '1234', now));
}

export function unlockParentAdmin(
  db: AppDb,
  pin: string,
  secret: string,
  now: number = Date.now(),
  rateLimiter?: PinRateLimiter,
  clientKey = 'global',
): { token: string } {
  rateLimiter?.assertAllowed(clientKey, now);
  const settings = ensureAppSettings(db, '1234', now);
  if (!verifyPinHash(pin, settings.parentPinHash)) {
    rateLimiter?.recordFailure(clientKey, now);
    throw new DomainError('INVALID_PIN', 'קוד הורים שגוי');
  }
  rateLimiter?.reset(clientKey);
  return { token: createAdminSessionToken(secret, now) };
}

export function updateAppSettings(db: AppDb, patch: UpdateSettingsBody, now: number = Date.now()): PublicSettings {
  return db.transaction((tx) => {
    const existing = tx.select().from(appSettings).where(eq(appSettings.id, 1)).get();
    if (!existing) {
      tx.insert(appSettings)
        .values({ id: 1, parentPinHash: hashPin('1234'), updatedAt: now })
        .run();
    }

    const { newParentPin, ...rest } = patch;
    const values: Partial<typeof appSettings.$inferInsert> = { ...rest, updatedAt: now };
    if (newParentPin !== undefined) {
      values.parentPinHash = hashPin(newParentPin);
    }

    const updated = tx.update(appSettings).set(values).where(eq(appSettings.id, 1)).returning().get();
    if (!updated) throw new DomainError('INTERNAL_ERROR', 'Failed to update app_settings');
    return toPublicSettings(updated);
  });
}

// ─── Profiles & Manual Star Adjustments ────────────────────────────────────────

function requireProfile(db: AppDb, id: number): Profile {
  const row = db.select().from(profiles).where(eq(profiles.id, id)).get();
  if (!row) throw new DomainError('NOT_FOUND', 'פרופיל ילד לא נמצא');
  return row;
}

export function listProfiles(db: AppDb): Profile[] {
  return db.select().from(profiles).orderBy(asc(profiles.sortOrder), asc(profiles.id)).all();
}

export function createProfile(db: AppDb, input: CreateProfileBody, now: number = Date.now()): Profile {
  return db
    .insert(profiles)
    .values({ ...input, createdAt: now })
    .returning()
    .get();
}

export function updateProfile(db: AppDb, id: number, patch: UpdateProfileBody): Profile {
  const updated = db.update(profiles).set(patch).where(eq(profiles.id, id)).returning().get();
  if (!updated) throw new DomainError('NOT_FOUND', 'פרופיל ילד לא נמצא');
  return updated;
}

export function deleteProfile(db: AppDb, id: number): void {
  const deleted = db.delete(profiles).where(eq(profiles.id, id)).returning({ id: profiles.id }).get();
  if (!deleted) throw new DomainError('NOT_FOUND', 'פרופיל ילד לא נמצא');
}

export function adjustProfileStars(
  db: AppDb,
  profileId: number,
  input: AdjustStarsBody,
  now: number = Date.now(),
): AdjustStarsResponse {
  return db.transaction((tx) => {
    const profile = tx.select().from(profiles).where(eq(profiles.id, profileId)).get();
    if (!profile) throw new DomainError('NOT_FOUND', 'פרופיל ילד לא נמצא');

    tx.insert(starTransactions)
      .values({
        profileId,
        sourceType: 'PARENT_ADJUSTMENT',
        sourceId: null,
        starsDelta: input.starsDelta,
        description: input.description ?? 'עדכון כוכבים ידני',
        logicalDate: getLogicalDateString(now),
        createdAt: now,
      })
      .run();

    const row = tx
      .select({ total: sql<number>`coalesce(sum(${starTransactions.starsDelta}), 0)` })
      .from(starTransactions)
      .where(eq(starTransactions.profileId, profileId))
      .get();

    return { profileId, totalStars: Number(row?.total ?? 0) };
  });
}

// ─── Routines CRUD ─────────────────────────────────────────────────────────────

function toRoutineDto(row: typeof routineTemplates.$inferSelect): RoutineTemplate {
  return {
    id: row.id,
    profileId: row.profileId,
    title: row.title,
    iconEmoji: row.iconEmoji,
    timeWindow: row.timeWindow,
    daysOfWeek: row.daysOfWeekJson,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export function listRoutines(db: AppDb): RoutineTemplate[] {
  return db
    .select()
    .from(routineTemplates)
    .orderBy(asc(routineTemplates.sortOrder), asc(routineTemplates.id))
    .all()
    .map(toRoutineDto);
}

export function createRoutine(db: AppDb, input: CreateRoutineBody, now: number = Date.now()): RoutineTemplate {
  requireProfile(db, input.profileId);
  const { daysOfWeek, ...rest } = input;
  const row = db
    .insert(routineTemplates)
    .values({ ...rest, daysOfWeekJson: daysOfWeek, createdAt: now })
    .returning()
    .get();
  return toRoutineDto(row);
}

export function updateRoutine(db: AppDb, id: number, patch: UpdateRoutineBody): RoutineTemplate {
  if (patch.profileId !== undefined) requireProfile(db, patch.profileId);
  const { daysOfWeek, ...rest } = patch;
  const values: Partial<typeof routineTemplates.$inferInsert> = { ...rest };
  if (daysOfWeek !== undefined) values.daysOfWeekJson = daysOfWeek;

  const updated = db.update(routineTemplates).set(values).where(eq(routineTemplates.id, id)).returning().get();
  if (!updated) throw new DomainError('NOT_FOUND', 'שגרה לא נמצאה');
  return toRoutineDto(updated);
}

export function deleteRoutine(db: AppDb, id: number): void {
  const deleted = db
    .delete(routineTemplates)
    .where(eq(routineTemplates.id, id))
    .returning({ id: routineTemplates.id })
    .get();
  if (!deleted) throw new DomainError('NOT_FOUND', 'שגרה לא נמצאה');
}

// ─── Personal Chores CRUD ──────────────────────────────────────────────────────

export function listPersonalChores(db: AppDb): PersonalChore[] {
  return db.select().from(personalChores).orderBy(asc(personalChores.createdAt), asc(personalChores.id)).all();
}

export function createPersonalChore(
  db: AppDb,
  input: CreatePersonalChoreBody,
  now: number = Date.now(),
): PersonalChore {
  requireProfile(db, input.profileId);
  return db
    .insert(personalChores)
    .values({
      ...input,
      status: 'PENDING',
      issuedDate: getLogicalDateString(now),
      createdAt: now,
    })
    .returning()
    .get();
}

export function updatePersonalChore(db: AppDb, id: number, patch: UpdatePersonalChoreBody): PersonalChore {
  if (patch.profileId !== undefined) requireProfile(db, patch.profileId);
  const updated = db.update(personalChores).set(patch).where(eq(personalChores.id, id)).returning().get();
  if (!updated) throw new DomainError('NOT_FOUND', 'משימה אישית לא נמצאה');
  return updated;
}

export function deletePersonalChore(db: AppDb, id: number): void {
  const deleted = db
    .delete(personalChores)
    .where(eq(personalChores.id, id))
    .returning({ id: personalChores.id })
    .get();
  if (!deleted) throw new DomainError('NOT_FOUND', 'משימה אישית לא נמצאה');
}

// ─── Pool Chores CRUD & Switchboard Actions ────────────────────────────────────

export function listPoolChores(db: AppDb): PoolChore[] {
  return db.select().from(poolChores).orderBy(asc(poolChores.sortOrder), asc(poolChores.id)).all();
}

export function createPoolChore(db: AppDb, input: CreatePoolChoreBody, now: number = Date.now()): PoolChore {
  return db
    .insert(poolChores)
    .values({ ...input, createdAt: now })
    .returning()
    .get();
}

export function updatePoolChore(db: AppDb, id: number, patch: UpdatePoolChoreBody): PoolChore {
  const updated = db.update(poolChores).set(patch).where(eq(poolChores.id, id)).returning().get();
  if (!updated) throw new DomainError('NOT_FOUND', 'משימה בקופה לא נמצאה');
  return updated;
}

export function deletePoolChore(db: AppDb, id: number): void {
  const deleted = db.delete(poolChores).where(eq(poolChores.id, id)).returning({ id: poolChores.id }).get();
  if (!deleted) throw new DomainError('NOT_FOUND', 'משימה בקופה לא נמצאה');
}

export function togglePoolChoreActive(db: AppDb, id: number, isActive: boolean): PoolChore {
  const updated = db.update(poolChores).set({ isActive }).where(eq(poolChores.id, id)).returning().get();
  if (!updated) throw new DomainError('NOT_FOUND', 'משימה בקופה לא נמצאה');
  return updated;
}

export function resetPoolChoreCooldown(db: AppDb, id: number): PoolChore {
  const updated = db.update(poolChores).set({ cooldownEndsAt: null }).where(eq(poolChores.id, id)).returning().get();
  if (!updated) throw new DomainError('NOT_FOUND', 'משימה בקופה לא נמצאה');
  return updated;
}
