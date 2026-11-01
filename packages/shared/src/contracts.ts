/**
 * Zod request/response contracts for `/api/v1/*`. Single source of truth for both the
 * Fastify server (validation) and the React client (inferred types).
 *
 * Conventions (see ARCHITECTURE.md §API):
 * - Resources are returned bare (no `data` envelope); lists are bare arrays.
 * - Errors always use `ApiErrorSchema`.
 * - Create bodies apply defaults; PATCH bodies never do (partial of the default-free fields).
 * - Bodies are strict objects: unknown keys are rejected.
 */
import { z } from 'zod';
import { PASTEL_THEMES } from './themes.js';
import { TIME_WINDOWS, isValidLogicalDate } from './time.js';

// ─── Domain enums (shared with the Drizzle schema) ──────────────────────────────

export const ROUTINE_LOG_STATUSES = ['COMPLETED', 'MISSED'] as const;
export type RoutineLogStatus = (typeof ROUTINE_LOG_STATUSES)[number];

export const PERSONAL_CHORE_STATUSES = ['PENDING', 'COMPLETED'] as const;
export type PersonalChoreStatus = (typeof PERSONAL_CHORE_STATUSES)[number];

export const POOL_RESET_MODES = ['COOLDOWN', 'AUTO_DISABLE'] as const;
export type PoolResetMode = (typeof POOL_RESET_MODES)[number];

export const STAR_SOURCE_TYPES = ['PERSONAL_CHORE', 'POOL_CHORE', 'UNDO', 'PARENT_ADJUSTMENT'] as const;
export type StarSourceType = (typeof STAR_SOURCE_TYPES)[number];

// ─── Primitives ─────────────────────────────────────────────────────────────────

export const IdSchema = z.number().int().positive();
export const IdParamsSchema = z.object({ id: z.coerce.number().int().positive() });
export type IdParams = z.infer<typeof IdParamsSchema>;

export const LogicalDateSchema = z.string().refine(isValidLogicalDate, 'Expected a calendar date in YYYY-MM-DD format');
export const TimestampSchema = z.number().int().nonnegative();
export const PinSchema = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits');
export const TitleSchema = z.string().trim().min(1).max(80);
export const NameSchema = z.string().trim().min(1).max(40);
export const EmojiSchema = z.string().trim().min(1).max(16);
export const StarsSchema = z.number().int().min(0).max(1000);
export const SortOrderSchema = z.number().int().min(0);
export const TimeWindowSchema = z.enum(TIME_WINDOWS);
export const PastelThemeSchema = z.enum(PASTEL_THEMES);
export const AvatarImageUrlSchema = z.url({ protocol: /^https?$/ }).max(2048).nullable();
export const DaysOfWeekSchema = z
  .array(z.literal([0, 1, 2, 3, 4, 5, 6]))
  .min(1)
  .max(7)
  .refine((days) => new Set(days).size === days.length, 'Days of week must be unique');

/** Rejects `{}` so a PATCH always changes something. */
const atLeastOneField = <T extends z.ZodType<Record<string, unknown>>>(schema: T) =>
  schema.refine((v) => Object.values(v).some((x) => x !== undefined), 'At least one field is required');

// ─── Errors ─────────────────────────────────────────────────────────────────────

/** HTTP mapping: VALIDATION_ERROR 400, UNAUTHORIZED/INVALID_PIN 401, NOT_FOUND 404, CONFLICT 409, RATE_LIMITED 429, INTERNAL_ERROR 500. */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'INVALID_PIN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ApiErrorSchema = z.object({
  error: z.object({ code: z.enum(API_ERROR_CODES), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// ─── Settings ───────────────────────────────────────────────────────────────────

/** `app_settings` as exposed to clients — never includes `parentPinHash`. */
export const PublicSettingsSchema = z.object({
  appTitle: z.string(),
  announcementEnabled: z.boolean(),
  announcementText: z.string().nullable(),
  announcementEmoji: z.string().nullable(),
  soundEnabled: z.boolean(),
});
export type PublicSettings = z.infer<typeof PublicSettingsSchema>;

// ─── Rings ──────────────────────────────────────────────────────────────────────

const CountSchema = z.number().int().nonnegative();

/** `totalScheduled = completedCount + redMissedCount + greyRemainingCount`; red only when elapsed, grey only when not. */
export const RingStateSchema = z.object({
  totalScheduled: CountSchema,
  completedCount: CountSchema,
  redMissedCount: CountSchema,
  greyRemainingCount: CountSchema,
  isWindowElapsed: z.boolean(),
});
export type RingState = z.infer<typeof RingStateSchema>;

export const RingsSchema = z.object({
  MORNING: RingStateSchema,
  AFTERNOON: RingStateSchema,
  EVENING: RingStateSchema,
});
export type Rings = z.infer<typeof RingsSchema>;

// ─── Board: GET /api/v1/board ───────────────────────────────────────────────────

export const ProfileSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  avatarEmoji: z.string(),
  avatarImageUrl: z.string().nullable(),
  pastelTheme: PastelThemeSchema,
  totalStars: z.number().int(),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

/** An uncompleted routine scheduled today (all windows; the client filters by the selected ring). */
export const BoardRoutineSchema = z.object({
  id: IdSchema,
  title: z.string(),
  iconEmoji: z.string(),
  timeWindow: TimeWindowSchema,
});
export type BoardRoutine = z.infer<typeof BoardRoutineSchema>;

export const BoardPersonalChoreSchema = z.object({
  id: IdSchema,
  title: z.string(),
  iconEmoji: z.string(),
  stars: z.number().int().nonnegative(),
});
export type BoardPersonalChore = z.infer<typeof BoardPersonalChoreSchema>;

export const BoardPoolChoreSchema = BoardPersonalChoreSchema;
export type BoardPoolChore = z.infer<typeof BoardPoolChoreSchema>;

const completedBase = { title: z.string(), iconEmoji: z.string(), completedAt: TimestampSchema };

/** `id` = routine template id → `POST /routines/:id/toggle`. */
export const CompletedRoutineSchema = z.object({
  kind: z.literal('ROUTINE'),
  id: IdSchema,
  timeWindow: TimeWindowSchema,
  ...completedBase,
});
/** `id` = personal chore id → `POST /personal-chores/:id/toggle`. */
export const CompletedPersonalChoreSchema = z.object({
  kind: z.literal('PERSONAL_CHORE'),
  id: IdSchema,
  stars: z.number().int().nonnegative(),
  ...completedBase,
});
/** `id` = pool completion id → `POST /pool-completions/:id/undo`; `stars` = starsAwarded. */
export const CompletedPoolChoreSchema = z.object({
  kind: z.literal('POOL_COMPLETION'),
  id: IdSchema,
  stars: z.number().int().nonnegative(),
  ...completedBase,
});

/** Entry in a child's "הושלמו היום" drawer. */
export const CompletedItemSchema = z.discriminatedUnion('kind', [
  CompletedRoutineSchema,
  CompletedPersonalChoreSchema,
  CompletedPoolChoreSchema,
]);
export type CompletedItem = z.infer<typeof CompletedItemSchema>;

export const BoardProfileSchema = ProfileSummarySchema.extend({
  rings: RingsSchema,
  pendingRoutines: z.array(BoardRoutineSchema),
  pendingChores: z.array(BoardPersonalChoreSchema),
  completedToday: z.array(CompletedItemSchema),
});
export type BoardProfile = z.infer<typeof BoardProfileSchema>;

export const BoardResponseSchema = z.object({
  logicalDate: LogicalDateSchema,
  currentWindow: TimeWindowSchema,
  settings: PublicSettingsSchema,
  profiles: z.array(BoardProfileSchema),
  /** Active and not cooling down. */
  poolChores: z.array(BoardPoolChoreSchema),
});
export type BoardResponse = z.infer<typeof BoardResponseSchema>;

// ─── Kid actions ────────────────────────────────────────────────────────────────

/** POST /api/v1/routines/:id/toggle — completes or unchecks for today. */
export const RoutineToggleResponseSchema = z.object({
  routineId: IdSchema,
  logicalDate: LogicalDateSchema,
  isCompleted: z.boolean(),
});
export type RoutineToggleResponse = z.infer<typeof RoutineToggleResponseSchema>;

/** POST /api/v1/personal-chores/:id/toggle — `starsDelta` is +stars on complete, -stars on uncheck. */
export const PersonalChoreToggleResponseSchema = z.object({
  choreId: IdSchema,
  status: z.enum(PERSONAL_CHORE_STATUSES),
  starsDelta: z.number().int(),
});
export type PersonalChoreToggleResponse = z.infer<typeof PersonalChoreToggleResponseSchema>;

/** POST /api/v1/pool-chores/:id/complete → 201. 409 CONFLICT when inactive or cooling down. */
export const CompletePoolChoreBodySchema = z.strictObject({ profileId: IdSchema });
export type CompletePoolChoreBody = z.infer<typeof CompletePoolChoreBodySchema>;

export const CompletePoolChoreResponseSchema = z.object({
  poolCompletionId: IdSchema,
  poolChoreId: IdSchema,
  profileId: IdSchema,
  starsAwarded: z.number().int().nonnegative(),
});
export type CompletePoolChoreResponse = z.infer<typeof CompletePoolChoreResponseSchema>;

/** POST /api/v1/pool-completions/:id/undo. `poolChoreId` is null if the chore was deleted. */
export const UndoPoolCompletionResponseSchema = z.object({
  poolCompletionId: IdSchema,
  poolChoreId: IdSchema.nullable(),
  starsDelta: z.number().int().nonpositive(),
});
export type UndoPoolCompletionResponse = z.infer<typeof UndoPoolCompletionResponseSchema>;

// ─── History: GET /api/v1/history?date=YYYY-MM-DD ───────────────────────────────

/** `date` defaults to today; future dates are rejected by the service (400). */
export const HistoryQuerySchema = z.object({ date: LogicalDateSchema.optional() });
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

/** PENDING only appears for today's not-yet-elapsed windows. */
export const HISTORY_ROUTINE_STATUSES = ['COMPLETED', 'MISSED', 'PENDING'] as const;
export type HistoryRoutineStatus = (typeof HISTORY_ROUTINE_STATUSES)[number];

export const HistoryRoutineSchema = z.object({
  /** null when the template was deleted (snapshot only; not toggleable). */
  routineId: IdSchema.nullable(),
  title: z.string(),
  iconEmoji: z.string(),
  timeWindow: TimeWindowSchema,
  status: z.enum(HISTORY_ROUTINE_STATUSES),
  completedAt: TimestampSchema.nullable(),
});
export type HistoryRoutine = z.infer<typeof HistoryRoutineSchema>;

export const HistoryChoreSchema = z.discriminatedUnion('kind', [CompletedPersonalChoreSchema, CompletedPoolChoreSchema]);
export type HistoryChore = z.infer<typeof HistoryChoreSchema>;

export const HistoryProfileSchema = ProfileSummarySchema.extend({
  starsEarnedThatDay: z.number().int(),
  rings: RingsSchema,
  routines: z.array(HistoryRoutineSchema),
  chores: z.array(HistoryChoreSchema),
});
export type HistoryProfile = z.infer<typeof HistoryProfileSchema>;

export const HistoryResponseSchema = z.object({
  logicalDate: LogicalDateSchema,
  isToday: z.boolean(),
  profiles: z.array(HistoryProfileSchema),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

// ─── Admin: session ─────────────────────────────────────────────────────────────

/** POST /api/v1/admin/unlock — 401 INVALID_PIN on mismatch, 429 RATE_LIMITED on repeated failures. */
export const UnlockBodySchema = z.strictObject({ pin: PinSchema });
export type UnlockBody = z.infer<typeof UnlockBodySchema>;

/** Response of /admin/unlock and /admin/lock. */
export const AdminSessionResponseSchema = z.object({ unlocked: z.boolean() });
export type AdminSessionResponse = z.infer<typeof AdminSessionResponseSchema>;

// ─── Admin: settings ────────────────────────────────────────────────────────────

/** PATCH /api/v1/admin/settings → PublicSettings. */
export const UpdateSettingsBodySchema = atLeastOneField(
  z.strictObject({
    appTitle: TitleSchema.optional(),
    announcementEnabled: z.boolean().optional(),
    announcementText: z.string().trim().max(200).nullable().optional(),
    announcementEmoji: EmojiSchema.nullable().optional(),
    soundEnabled: z.boolean().optional(),
    newParentPin: PinSchema.optional(),
  }),
);
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBodySchema>;

// ─── Admin: profiles (CRUD /api/v1/admin/profiles) ──────────────────────────────

export const ProfileSchema = z.object({
  id: IdSchema,
  name: z.string(),
  avatarEmoji: z.string(),
  avatarImageUrl: z.string().nullable(),
  pastelTheme: PastelThemeSchema,
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: TimestampSchema,
});
export type Profile = z.infer<typeof ProfileSchema>;

const profileFields = {
  name: NameSchema,
  avatarEmoji: EmojiSchema,
  avatarImageUrl: AvatarImageUrlSchema,
  pastelTheme: PastelThemeSchema,
  sortOrder: SortOrderSchema,
  isActive: z.boolean(),
};

export const CreateProfileBodySchema = z.strictObject({
  ...profileFields,
  avatarImageUrl: AvatarImageUrlSchema.default(null),
  sortOrder: SortOrderSchema.default(0),
  isActive: z.boolean().default(true),
});
export type CreateProfileBody = z.infer<typeof CreateProfileBodySchema>;

export const UpdateProfileBodySchema = atLeastOneField(z.strictObject(profileFields).partial());
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;

/** POST /api/v1/admin/profiles/:id/adjust-stars — writes a PARENT_ADJUSTMENT ledger row. */
export const AdjustStarsBodySchema = z.strictObject({
  starsDelta: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((n) => n !== 0, 'starsDelta must not be 0'),
  description: z.string().trim().min(1).max(120).optional(),
});
export type AdjustStarsBody = z.infer<typeof AdjustStarsBodySchema>;

export const AdjustStarsResponseSchema = z.object({ profileId: IdSchema, totalStars: z.number().int() });
export type AdjustStarsResponse = z.infer<typeof AdjustStarsResponseSchema>;

// ─── Admin: routines (CRUD /api/v1/admin/routines) ──────────────────────────────

export const RoutineTemplateSchema = z.object({
  id: IdSchema,
  profileId: IdSchema,
  title: z.string(),
  iconEmoji: z.string(),
  timeWindow: TimeWindowSchema,
  daysOfWeek: DaysOfWeekSchema,
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: TimestampSchema,
});
export type RoutineTemplate = z.infer<typeof RoutineTemplateSchema>;

const routineFields = {
  profileId: IdSchema,
  title: TitleSchema,
  iconEmoji: EmojiSchema,
  timeWindow: TimeWindowSchema,
  daysOfWeek: DaysOfWeekSchema,
  sortOrder: SortOrderSchema,
  isActive: z.boolean(),
};

export const CreateRoutineBodySchema = z.strictObject({
  ...routineFields,
  sortOrder: SortOrderSchema.default(0),
  isActive: z.boolean().default(true),
});
export type CreateRoutineBody = z.infer<typeof CreateRoutineBodySchema>;

export const UpdateRoutineBodySchema = atLeastOneField(z.strictObject(routineFields).partial());
export type UpdateRoutineBody = z.infer<typeof UpdateRoutineBodySchema>;

// ─── Admin: personal chores (CRUD /api/v1/admin/personal-chores) ────────────────

export const PersonalChoreSchema = z.object({
  id: IdSchema,
  profileId: IdSchema,
  title: z.string(),
  iconEmoji: z.string(),
  stars: z.number().int().nonnegative(),
  status: z.enum(PERSONAL_CHORE_STATUSES),
  issuedDate: LogicalDateSchema,
  completedDate: LogicalDateSchema.nullable(),
  completedAt: TimestampSchema.nullable(),
  createdAt: TimestampSchema,
});
export type PersonalChore = z.infer<typeof PersonalChoreSchema>;

const personalChoreFields = { profileId: IdSchema, title: TitleSchema, iconEmoji: EmojiSchema, stars: StarsSchema };

export const CreatePersonalChoreBodySchema = z.strictObject({ ...personalChoreFields, stars: StarsSchema.default(0) });
export type CreatePersonalChoreBody = z.infer<typeof CreatePersonalChoreBodySchema>;

export const UpdatePersonalChoreBodySchema = atLeastOneField(z.strictObject(personalChoreFields).partial());
export type UpdatePersonalChoreBody = z.infer<typeof UpdatePersonalChoreBodySchema>;

// ─── Admin: pool chores (CRUD /api/v1/admin/pool-chores) ────────────────────────

export const PoolChoreSchema = z.object({
  id: IdSchema,
  title: z.string(),
  iconEmoji: z.string(),
  stars: z.number().int().nonnegative(),
  resetMode: z.enum(POOL_RESET_MODES),
  cooldownMinutes: z.number().int().positive(),
  isActive: z.boolean(),
  cooldownEndsAt: TimestampSchema.nullable(),
  lastCompletedAt: TimestampSchema.nullable(),
  sortOrder: z.number().int(),
  createdAt: TimestampSchema,
});
export type PoolChore = z.infer<typeof PoolChoreSchema>;

const CooldownMinutesSchema = z.number().int().min(1).max(7 * 24 * 60);

const poolChoreFields = {
  title: TitleSchema,
  iconEmoji: EmojiSchema,
  stars: StarsSchema,
  resetMode: z.enum(POOL_RESET_MODES),
  cooldownMinutes: CooldownMinutesSchema,
  sortOrder: SortOrderSchema,
  isActive: z.boolean(),
};

export const CreatePoolChoreBodySchema = z.strictObject({
  ...poolChoreFields,
  stars: StarsSchema.default(1),
  cooldownMinutes: CooldownMinutesSchema.default(60),
  sortOrder: SortOrderSchema.default(0),
  isActive: z.boolean().default(true),
});
export type CreatePoolChoreBody = z.infer<typeof CreatePoolChoreBodySchema>;

export const UpdatePoolChoreBodySchema = atLeastOneField(z.strictObject(poolChoreFields).partial());
export type UpdatePoolChoreBody = z.infer<typeof UpdatePoolChoreBodySchema>;

/** PATCH /api/v1/admin/pool-chores/:id/toggle-active — explicit target state keeps double-taps idempotent. */
export const TogglePoolChoreActiveBodySchema = z.strictObject({ isActive: z.boolean() });
export type TogglePoolChoreActiveBody = z.infer<typeof TogglePoolChoreActiveBodySchema>;

// POST /api/v1/admin/pool-chores/:id/reset-cooldown → PoolChore (no body).

// ─── Admin: history correction ──────────────────────────────────────────────────

/** POST /api/v1/admin/history/toggle-routine — flips COMPLETED ↔ MISSED for a past date (409 if date ≥ today). */
export const ToggleHistoryRoutineBodySchema = z.strictObject({ routineId: IdSchema, logicalDate: LogicalDateSchema });
export type ToggleHistoryRoutineBody = z.infer<typeof ToggleHistoryRoutineBodySchema>;

export const ToggleHistoryRoutineResponseSchema = z.object({
  routineId: IdSchema,
  logicalDate: LogicalDateSchema,
  status: z.enum(ROUTINE_LOG_STATUSES),
});
export type ToggleHistoryRoutineResponse = z.infer<typeof ToggleHistoryRoutineResponseSchema>;
