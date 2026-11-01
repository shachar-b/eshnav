import type { AppDb } from './connection.js';
import {
  createPersonalChore,
  createPoolChore,
  createProfile,
  createRoutine,
  ensureAppSettings,
  listProfiles,
} from '../services/admin.service.js';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Idempotent family seed matching SPEC §4 Milestone 3:
 * - appTitle = 'הבית שלנו', default PIN = '1234'
 * - 3 distinct pastel child profiles (SKY, CORAL, MINT)
 * - Morning, Afternoon & Evening routines with Niqqud
 * - Personal one-off chores
 * - Metallic Gold pool chores ('פינוי מדיח' AUTO_DISABLE & 'סידור סלון' COOLDOWN)
 */
export function seedFamilyData(db: AppDb, now: number = Date.now()): void {
  ensureAppSettings(db, '1234', now);
  if (listProfiles(db).length > 0) return;

  db.transaction(() => {
    const noa = createProfile(
      db,
      {
        name: 'נוֹעָה',
        avatarEmoji: '🦄',
        avatarImageUrl: null,
        pastelTheme: 'SKY',
        sortOrder: 0,
        isActive: true,
      },
      now,
    );

    const itay = createProfile(
      db,
      {
        name: 'אִיתַי',
        avatarEmoji: '🦖',
        avatarImageUrl: null,
        pastelTheme: 'CORAL',
        sortOrder: 1,
        isActive: true,
      },
      now,
    );

    const maya = createProfile(
      db,
      {
        name: 'מָאיָה',
        avatarEmoji: '🦁',
        avatarImageUrl: null,
        pastelTheme: 'MINT',
        sortOrder: 2,
        isActive: true,
      },
      now,
    );

    for (const child of [noa, itay, maya]) {
      createRoutine(
        db,
        {
          profileId: child.id,
          title: 'לְצַחְצֵחַ שִׁנַּיִם',
          iconEmoji: '🪥',
          timeWindow: 'MORNING',
          daysOfWeek: [...ALL_DAYS],
          sortOrder: 0,
          isActive: true,
        },
        now,
      );
      createRoutine(
        db,
        {
          profileId: child.id,
          title: 'לְסַדֵּר מִטָּה',
          iconEmoji: '🛏️',
          timeWindow: 'MORNING',
          daysOfWeek: [...ALL_DAYS],
          sortOrder: 1,
          isActive: true,
        },
        now,
      );
      createRoutine(
        db,
        {
          profileId: child.id,
          title: 'שִׁעוּרֵי בַּיִת וּקְרִיאָה',
          iconEmoji: '📚',
          timeWindow: 'AFTERNOON',
          daysOfWeek: [...ALL_DAYS],
          sortOrder: 0,
          isActive: true,
        },
        now,
      );
      createRoutine(
        db,
        {
          profileId: child.id,
          title: 'מִקְלַחַת וּפִּיגָ׳מָה',
          iconEmoji: '🚿',
          timeWindow: 'EVENING',
          daysOfWeek: [...ALL_DAYS],
          sortOrder: 0,
          isActive: true,
        },
        now,
      );
      createRoutine(
        db,
        {
          profileId: child.id,
          title: 'צִחְצוּחַ לִפְנֵי שֵׁנָה',
          iconEmoji: '🌙',
          timeWindow: 'EVENING',
          daysOfWeek: [...ALL_DAYS],
          sortOrder: 1,
          isActive: true,
        },
        now,
      );
    }

    createPersonalChore(
      db,
      { profileId: noa.id, title: 'לְסַדֵּר מַדַּף סְפָרִים', iconEmoji: '📖', stars: 2 },
      now,
    );
    createPersonalChore(
      db,
      { profileId: itay.id, title: 'מִיּוּן קֻפְסַת לֶגוֹ', iconEmoji: '🧩', stars: 3 },
      now,
    );
    createPersonalChore(
      db,
      { profileId: maya.id, title: 'הַחְזָרַת צַעֲצוּעִים לַסַּל', iconEmoji: '🧸', stars: 2 },
      now,
    );

    createPoolChore(
      db,
      {
        title: 'פינוי מדיח',
        iconEmoji: '🍽️',
        stars: 3,
        resetMode: 'AUTO_DISABLE',
        cooldownMinutes: 60,
        sortOrder: 0,
        isActive: true,
      },
      now,
    );
    createPoolChore(
      db,
      {
        title: 'סידור סלון',
        iconEmoji: '🧹',
        stars: 2,
        resetMode: 'COOLDOWN',
        cooldownMinutes: 120,
        sortOrder: 1,
        isActive: true,
      },
      now,
    );
    createPoolChore(
      db,
      {
        title: 'הוצאת מחזור',
        iconEmoji: '♻️',
        stars: 2,
        resetMode: 'COOLDOWN',
        cooldownMinutes: 180,
        sortOrder: 2,
        isActive: true,
      },
      now,
    );
  });
}
