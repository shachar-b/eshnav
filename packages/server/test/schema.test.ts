import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { DEFAULT_DB_PATH, REPO_ROOT, openDatabase, resolveDbPath, type AppDb } from '../src/db/connection.js';
import {
  appSettings,
  personalChores,
  poolChores,
  poolCompletions,
  profiles,
  routineDailyLogs,
  routineTemplates,
  starTransactions,
} from '../src/db/schema.js';

const DATE = '2026-11-01';

function insertProfile(db: AppDb, name = 'נוֹעָה') {
  return db.insert(profiles).values({ name, avatarEmoji: '🦄', pastelTheme: 'SKY' }).returning().get();
}

function insertRoutine(db: AppDb, profileId: number) {
  return db
    .insert(routineTemplates)
    .values({ profileId, title: 'לְצַחְצֵחַ שִׁנַּיִם', iconEmoji: '🪥', timeWindow: 'MORNING', daysOfWeekJson: [0, 1, 2, 3, 4, 5] })
    .returning()
    .get();
}

function insertPoolChore(db: AppDb, overrides: Partial<typeof poolChores.$inferInsert> = {}) {
  return db
    .insert(poolChores)
    .values({ title: 'פִּנּוּי מֵדִיחַ', iconEmoji: '🍽️', resetMode: 'AUTO_DISABLE', ...overrides })
    .returning()
    .get();
}

describe('resolveDbPath', () => {
  it('anchors REPO_ROOT at the monorepo root', () => {
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { name: string };
    expect(pkg.name).toBe('eshnav');
  });

  it('resolves relative paths against the monorepo root, not the cwd', () => {
    expect(resolveDbPath('./data/x.db')).toBe(path.join(REPO_ROOT, 'data', 'x.db'));
    expect(resolveDbPath(undefined)).toBe(path.join(REPO_ROOT, DEFAULT_DB_PATH));
  });

  it('keeps absolute paths and :memory: as-is', () => {
    const abs = path.join(tmpdir(), 'eshnav.db');
    expect(resolveDbPath(abs)).toBe(abs);
    expect(resolveDbPath(':memory:')).toBe(':memory:');
  });
});

describe('openDatabase on a file', () => {
  let dir: string;
  let db: AppDb;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'eshnav-'));
    db = openDatabase(path.join(dir, 'nested', 'eshnav.db'));
  });

  afterEach(() => {
    db.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('applies the mandatory pragmas', () => {
    const pragma = (name: string): unknown => db.$client.pragma(name, { simple: true });
    expect(pragma('journal_mode')).toBe('wal');
    expect(pragma('synchronous')).toBe(1); // NORMAL
    expect(pragma('foreign_keys')).toBe(1);
    expect(pragma('busy_timeout')).toBe(5000);
  });

  it('creates every table via migrations', () => {
    const tables = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'")
      .pluck()
      .all();
    expect(new Set(tables)).toEqual(
      new Set([
        'app_settings',
        'profiles',
        'routine_templates',
        'routine_daily_logs',
        'personal_chores',
        'pool_chores',
        'pool_completions',
        'star_transactions',
      ]),
    );
  });

  it('is safe to reopen (migrations are idempotent)', () => {
    const file = db.$client.name;
    db.$client.close();
    db = openDatabase(file);
    expect(db.select().from(profiles).all()).toEqual([]);
  });
});

describe('schema constraints', () => {
  let db: AppDb;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.$client.close();
  });

  it('app_settings is a singleton with spec defaults', () => {
    db.insert(appSettings).values({ parentPinHash: 'hash' }).run();
    expect(db.select().from(appSettings).get()).toMatchObject({
      id: 1,
      appTitle: 'הבית שלנו',
      announcementEnabled: false,
      announcementText: null,
      announcementEmoji: '📣',
      soundEnabled: true,
    });
    expect(() => db.insert(appSettings).values({ id: 2, parentPinHash: 'hash' }).run()).toThrow(/CHECK constraint/);
  });

  it('profiles apply defaults and reject unknown pastel themes', () => {
    expect(insertProfile(db)).toMatchObject({ sortOrder: 0, isActive: true, avatarImageUrl: null });
    expect(() =>
      db.$client.prepare("INSERT INTO profiles (name, avatarEmoji, pastelTheme, createdAt) VALUES ('x', '🦁', 'NEON', 0)").run(),
    ).toThrow(/CHECK constraint/);
  });

  it('round-trips routine days of week as a JSON array', () => {
    const routine = insertRoutine(db, insertProfile(db).id);
    expect(db.select().from(routineTemplates).where(eq(routineTemplates.id, routine.id)).get()?.daysOfWeekJson).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });

  it('rejects negative stars on personal and pool chores', () => {
    const { id: profileId } = insertProfile(db);
    expect(() =>
      db.insert(personalChores).values({ profileId, title: 'x', iconEmoji: '🧸', stars: -1, issuedDate: DATE }).run(),
    ).toThrow(/CHECK constraint/);
    expect(() => insertPoolChore(db, { stars: -1 })).toThrow(/CHECK constraint/);
  });

  it('rejects non-positive pool cooldownMinutes and applies pool defaults', () => {
    expect(() => insertPoolChore(db, { cooldownMinutes: 0 })).toThrow(/CHECK constraint/);
    expect(insertPoolChore(db)).toMatchObject({ stars: 1, cooldownMinutes: 60, isActive: true, cooldownEndsAt: null });
  });

  it('allows one routine log per routine per day; onConflictDoNothing keeps rollover idempotent', () => {
    const profile = insertProfile(db);
    const routine = insertRoutine(db, profile.id);
    const log = {
      routineId: routine.id,
      profileId: profile.id,
      titleSnapshot: routine.title,
      iconEmojiSnapshot: routine.iconEmoji,
      timeWindowSnapshot: routine.timeWindow,
      logicalDate: DATE,
      status: 'MISSED',
    } as const;
    db.insert(routineDailyLogs).values(log).run();
    expect(() => db.insert(routineDailyLogs).values(log).run()).toThrow(/UNIQUE constraint/);
    db.insert(routineDailyLogs).values(log).onConflictDoNothing().run();
    expect(db.select().from(routineDailyLogs).all()).toHaveLength(1);
  });

  it('enforces foreign keys', () => {
    expect(() => insertRoutine(db, 999)).toThrow(/FOREIGN KEY constraint/);
  });

  it('keeps history snapshots when a routine template or pool chore is deleted', () => {
    const profile = insertProfile(db);
    const routine = insertRoutine(db, profile.id);
    const chore = insertPoolChore(db);
    db.insert(routineDailyLogs)
      .values({
        routineId: routine.id,
        profileId: profile.id,
        titleSnapshot: routine.title,
        iconEmojiSnapshot: routine.iconEmoji,
        timeWindowSnapshot: routine.timeWindow,
        logicalDate: DATE,
        status: 'COMPLETED',
        completedAt: 1,
      })
      .run();
    db.insert(poolCompletions)
      .values({
        poolChoreId: chore.id,
        profileId: profile.id,
        titleSnapshot: chore.title,
        iconEmojiSnapshot: chore.iconEmoji,
        starsAwarded: 1,
        logicalDate: DATE,
        completedAt: 1,
      })
      .run();

    db.delete(routineTemplates).run();
    db.delete(poolChores).run();

    expect(db.select().from(routineDailyLogs).get()).toMatchObject({ routineId: null, titleSnapshot: routine.title });
    expect(db.select().from(poolCompletions).get()).toMatchObject({ poolChoreId: null, titleSnapshot: chore.title });
  });

  it('cascades a profile delete to all of its rows', () => {
    const profile = insertProfile(db);
    const other = insertProfile(db, 'אִיתַי');
    const routine = insertRoutine(db, profile.id);
    db.insert(routineDailyLogs)
      .values({
        routineId: routine.id,
        profileId: profile.id,
        titleSnapshot: 'x',
        iconEmojiSnapshot: '🪥',
        timeWindowSnapshot: 'MORNING',
        logicalDate: DATE,
        status: 'MISSED',
      })
      .run();
    db.insert(personalChores).values({ profileId: profile.id, title: 'x', iconEmoji: '🧸', issuedDate: DATE }).run();
    db.insert(poolCompletions)
      .values({ profileId: profile.id, titleSnapshot: 'x', iconEmojiSnapshot: '🍽️', starsAwarded: 1, logicalDate: DATE, completedAt: 1 })
      .run();
    db.insert(starTransactions)
      .values([
        { profileId: profile.id, sourceType: 'PARENT_ADJUSTMENT', starsDelta: 5, description: 'x', logicalDate: DATE },
        { profileId: other.id, sourceType: 'PARENT_ADJUSTMENT', starsDelta: 2, description: 'y', logicalDate: DATE },
      ])
      .run();

    db.delete(profiles).where(eq(profiles.id, profile.id)).run();

    expect(db.select().from(routineTemplates).all()).toEqual([]);
    expect(db.select().from(routineDailyLogs).all()).toEqual([]);
    expect(db.select().from(personalChores).all()).toEqual([]);
    expect(db.select().from(poolCompletions).all()).toEqual([]);
    expect(db.select().from(starTransactions).all()).toMatchObject([{ profileId: other.id, starsDelta: 2 }]);
  });

  it('rejects unknown enum values at the database level', () => {
    const { id: profileId } = insertProfile(db);
    expect(() =>
      db.$client
        .prepare(
          "INSERT INTO star_transactions (profileId, sourceType, starsDelta, description, logicalDate, createdAt) VALUES (?, 'BRIBE', 1, 'x', ?, 0)",
        )
        .run(profileId, DATE),
    ).toThrow(/CHECK constraint/);
  });
});
