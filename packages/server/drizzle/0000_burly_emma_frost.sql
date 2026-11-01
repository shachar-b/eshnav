CREATE TABLE `app_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`appTitle` text DEFAULT 'הבית שלנו' NOT NULL,
	`parentPinHash` text NOT NULL,
	`announcementEnabled` integer DEFAULT false NOT NULL,
	`announcementText` text,
	`announcementEmoji` text DEFAULT '📣',
	`soundEnabled` integer DEFAULT true NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT "app_settings_singleton" CHECK("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `personal_chores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profileId` integer NOT NULL,
	`title` text NOT NULL,
	`iconEmoji` text NOT NULL,
	`stars` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`issuedDate` text NOT NULL,
	`completedDate` text,
	`completedAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "personal_chores_stars" CHECK("personal_chores"."stars" >= 0),
	CONSTRAINT "personal_chores_status" CHECK("personal_chores"."status" IN ('PENDING', 'COMPLETED'))
);
--> statement-breakpoint
CREATE INDEX `personal_chores_profile_status_idx` ON `personal_chores` (`profileId`,`status`);--> statement-breakpoint
CREATE TABLE `pool_chores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`iconEmoji` text NOT NULL,
	`stars` integer DEFAULT 1 NOT NULL,
	`resetMode` text NOT NULL,
	`cooldownMinutes` integer DEFAULT 60 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`cooldownEndsAt` integer,
	`lastCompletedAt` integer,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT "pool_chores_stars" CHECK("pool_chores"."stars" >= 0),
	CONSTRAINT "pool_chores_cooldown_minutes" CHECK("pool_chores"."cooldownMinutes" > 0),
	CONSTRAINT "pool_chores_reset_mode" CHECK("pool_chores"."resetMode" IN ('COOLDOWN', 'AUTO_DISABLE'))
);
--> statement-breakpoint
CREATE TABLE `pool_completions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`poolChoreId` integer,
	`profileId` integer NOT NULL,
	`titleSnapshot` text NOT NULL,
	`iconEmojiSnapshot` text NOT NULL,
	`starsAwarded` integer NOT NULL,
	`logicalDate` text NOT NULL,
	`completedAt` integer NOT NULL,
	FOREIGN KEY (`poolChoreId`) REFERENCES `pool_chores`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pool_completions_profile_date_idx` ON `pool_completions` (`profileId`,`logicalDate`);--> statement-breakpoint
CREATE INDEX `pool_completions_date_idx` ON `pool_completions` (`logicalDate`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatarEmoji` text NOT NULL,
	`avatarImageUrl` text,
	`pastelTheme` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT "profiles_pastel_theme" CHECK("profiles"."pastelTheme" IN ('SKY', 'CORAL', 'MINT', 'LAVENDER', 'BUTTERCUP', 'ROSE', 'SAGE', 'PERIWINKLE', 'APRICOT', 'AQUA'))
);
--> statement-breakpoint
CREATE TABLE `routine_daily_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`routineId` integer,
	`profileId` integer NOT NULL,
	`titleSnapshot` text NOT NULL,
	`iconEmojiSnapshot` text NOT NULL,
	`timeWindowSnapshot` text NOT NULL,
	`logicalDate` text NOT NULL,
	`status` text NOT NULL,
	`completedAt` integer,
	FOREIGN KEY (`routineId`) REFERENCES `routine_templates`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "routine_daily_logs_time_window" CHECK("routine_daily_logs"."timeWindowSnapshot" IN ('MORNING', 'AFTERNOON', 'EVENING')),
	CONSTRAINT "routine_daily_logs_status" CHECK("routine_daily_logs"."status" IN ('COMPLETED', 'MISSED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_daily_logs_routine_date_uq` ON `routine_daily_logs` (`routineId`,`logicalDate`);--> statement-breakpoint
CREATE INDEX `routine_daily_logs_profile_date_idx` ON `routine_daily_logs` (`profileId`,`logicalDate`);--> statement-breakpoint
CREATE INDEX `routine_daily_logs_date_idx` ON `routine_daily_logs` (`logicalDate`);--> statement-breakpoint
CREATE TABLE `routine_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profileId` integer NOT NULL,
	`title` text NOT NULL,
	`iconEmoji` text NOT NULL,
	`timeWindow` text NOT NULL,
	`daysOfWeekJson` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "routine_templates_time_window" CHECK("routine_templates"."timeWindow" IN ('MORNING', 'AFTERNOON', 'EVENING'))
);
--> statement-breakpoint
CREATE INDEX `routine_templates_profile_idx` ON `routine_templates` (`profileId`);--> statement-breakpoint
CREATE TABLE `star_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profileId` integer NOT NULL,
	`sourceType` text NOT NULL,
	`sourceId` integer,
	`starsDelta` integer NOT NULL,
	`description` text NOT NULL,
	`logicalDate` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "star_transactions_source_type" CHECK("star_transactions"."sourceType" IN ('PERSONAL_CHORE', 'POOL_CHORE', 'UNDO', 'PARENT_ADJUSTMENT'))
);
--> statement-breakpoint
CREATE INDEX `star_transactions_profile_date_idx` ON `star_transactions` (`profileId`,`logicalDate`);--> statement-breakpoint
CREATE INDEX `star_transactions_date_idx` ON `star_transactions` (`logicalDate`);