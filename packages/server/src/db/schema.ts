/**
 * eshnav SQLite schema (Drizzle ORM / better-sqlite3).
 *
 * - Column names match the spec's camelCase field names; table names are snake_case.
 * - Timestamps are Unix ms integers; logical dates are `YYYY-MM-DD` (Asia/Jerusalem) text.
 * - Enum columns carry DB-level CHECKs so raw writes cannot corrupt domain state.
 * - History rows (`routine_daily_logs`, `pool_completions`) snapshot title/emoji and
 *   survive template deletion (FK → SET NULL); deleting a profile cascades everything it owns.
 * - Star balances are never stored: they are SUM(star_transactions.starsDelta).
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  PASTEL_THEMES,
  PERSONAL_CHORE_STATUSES,
  POOL_RESET_MODES,
  ROUTINE_LOG_STATUSES,
  STAR_SOURCE_TYPES,
  TIME_WINDOWS,
  type DayOfWeek,
} from '@eshnav/shared';

/** Inline literal list for enum CHECKs (values are compile-time constants, never user input). */
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

const createdAt = () =>
  integer()
    .notNull()
    .$defaultFn(() => Date.now());

export const appSettings = sqliteTable(
  'app_settings',
  {
    id: integer().primaryKey().default(1),
    appTitle: text().notNull().default('הבית שלנו'),
    parentPinHash: text().notNull(),
    announcementEnabled: integer({ mode: 'boolean' }).notNull().default(false),
    announcementText: text(),
    announcementEmoji: text().default('📣'),
    soundEnabled: integer({ mode: 'boolean' }).notNull().default(true),
    updatedAt: integer()
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [check('app_settings_singleton', sql`${t.id} = 1`)],
);

export const profiles = sqliteTable(
  'profiles',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    avatarEmoji: text().notNull(),
    avatarImageUrl: text(),
    pastelTheme: text({ enum: PASTEL_THEMES }).notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check('profiles_pastel_theme', sql`${t.pastelTheme} IN (${inList(PASTEL_THEMES)})`)],
);

export const routineTemplates = sqliteTable(
  'routine_templates',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    iconEmoji: text().notNull(),
    timeWindow: text({ enum: TIME_WINDOWS }).notNull(),
    /** JSON array of DayOfWeek (0 = Sunday … 6 = Saturday). */
    daysOfWeekJson: text({ mode: 'json' }).$type<DayOfWeek[]>().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: integer({ mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('routine_templates_profile_idx').on(t.profileId),
    check('routine_templates_time_window', sql`${t.timeWindow} IN (${inList(TIME_WINDOWS)})`),
  ],
);

export const routineDailyLogs = sqliteTable(
  'routine_daily_logs',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    routineId: integer().references(() => routineTemplates.id, { onDelete: 'set null' }),
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    titleSnapshot: text().notNull(),
    iconEmojiSnapshot: text().notNull(),
    timeWindowSnapshot: text({ enum: TIME_WINDOWS }).notNull(),
    logicalDate: text().notNull(),
    status: text({ enum: ROUTINE_LOG_STATUSES }).notNull(),
    completedAt: integer(),
  },
  (t) => [
    uniqueIndex('routine_daily_logs_routine_date_uq').on(t.routineId, t.logicalDate),
    index('routine_daily_logs_profile_date_idx').on(t.profileId, t.logicalDate),
    index('routine_daily_logs_date_idx').on(t.logicalDate),
    check('routine_daily_logs_time_window', sql`${t.timeWindowSnapshot} IN (${inList(TIME_WINDOWS)})`),
    check('routine_daily_logs_status', sql`${t.status} IN (${inList(ROUTINE_LOG_STATUSES)})`),
  ],
);

export const personalChores = sqliteTable(
  'personal_chores',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    title: text().notNull(),
    iconEmoji: text().notNull(),
    stars: integer().notNull().default(0),
    status: text({ enum: PERSONAL_CHORE_STATUSES }).notNull().default('PENDING'),
    issuedDate: text().notNull(),
    completedDate: text(),
    completedAt: integer(),
    createdAt: createdAt(),
  },
  (t) => [
    index('personal_chores_profile_status_idx').on(t.profileId, t.status),
    check('personal_chores_stars', sql`${t.stars} >= 0`),
    check('personal_chores_status', sql`${t.status} IN (${inList(PERSONAL_CHORE_STATUSES)})`),
  ],
);

export const poolChores = sqliteTable(
  'pool_chores',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    iconEmoji: text().notNull(),
    stars: integer().notNull().default(1),
    resetMode: text({ enum: POOL_RESET_MODES }).notNull(),
    cooldownMinutes: integer().notNull().default(60),
    isActive: integer({ mode: 'boolean' }).notNull().default(true),
    cooldownEndsAt: integer(),
    lastCompletedAt: integer(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    check('pool_chores_stars', sql`${t.stars} >= 0`),
    check('pool_chores_cooldown_minutes', sql`${t.cooldownMinutes} > 0`),
    check('pool_chores_reset_mode', sql`${t.resetMode} IN (${inList(POOL_RESET_MODES)})`),
  ],
);

export const poolCompletions = sqliteTable(
  'pool_completions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    poolChoreId: integer().references(() => poolChores.id, { onDelete: 'set null' }),
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    titleSnapshot: text().notNull(),
    iconEmojiSnapshot: text().notNull(),
    starsAwarded: integer().notNull(),
    logicalDate: text().notNull(),
    completedAt: integer().notNull(),
  },
  (t) => [
    index('pool_completions_profile_date_idx').on(t.profileId, t.logicalDate),
    index('pool_completions_date_idx').on(t.logicalDate),
  ],
);

/** Append-only ledger. Corrections are compensating rows (UNDO / PARENT_ADJUSTMENT), never updates. */
export const starTransactions = sqliteTable(
  'star_transactions',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    profileId: integer()
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sourceType: text({ enum: STAR_SOURCE_TYPES }).notNull(),
    /** personal_chores.id or pool_completions.id (intentionally not an FK: the ledger outlives its sources). */
    sourceId: integer(),
    starsDelta: integer().notNull(),
    description: text().notNull(),
    logicalDate: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('star_transactions_profile_date_idx').on(t.profileId, t.logicalDate),
    index('star_transactions_date_idx').on(t.logicalDate),
    check('star_transactions_source_type', sql`${t.sourceType} IN (${inList(STAR_SOURCE_TYPES)})`),
  ],
);
