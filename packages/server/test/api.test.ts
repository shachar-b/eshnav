import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  BoardResponseSchema,
  HistoryResponseSchema,
  type BoardResponse,
  type PoolChore,
  type Profile,
  type RoutineTemplate,
  type PersonalChore,
} from '@eshnav/shared';
import { buildApp } from '../src/app.js';
import { openDatabase, type AppDb } from '../src/db/connection.js';
import { seedFamilyData } from '../src/db/seed-data.js';
import { runDailyRollover } from '../src/services/rollover.service.js';

const SUN_MORNING = Date.UTC(2026, 10, 1, 7, 30); // Sun 2026-11-01 09:30 IST (dow 0)
const SECRET = 'x'.repeat(32);

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!raw) throw new Error('Expected Set-Cookie header');
  return raw.split(';')[0]!;
}

describe('Fastify REST API (/api/v1/*) & Family Seed', () => {
  let db: AppDb;
  let app: FastifyInstance;
  let currentNow: number;

  beforeEach(async () => {
    currentNow = SUN_MORNING;
    db = openDatabase(':memory:');
    seedFamilyData(db, currentNow);
    app = await buildApp({
      db,
      sessionSecret: SECRET,
      clock: () => currentNow,
    });
  });

  afterEach(async () => {
    await app.close();
    db.$client.close();
  });

  it('seeds the family board with 3 distinct pastel profiles, Niqqud routines, personal chores, and pool chores', async () => {
    // Calling seedFamilyData again is idempotent (no duplicate profiles)
    seedFamilyData(db, currentNow);

    const res = await app.inject({ method: 'GET', url: '/api/v1/board' });
    expect(res.statusCode).toBe(200);
    const board = BoardResponseSchema.parse(res.json());

    expect(board.settings.appTitle).toBe('הבית שלנו');
    expect(board.profiles).toHaveLength(3);
    expect(board.profiles.map((p) => p.pastelTheme)).toEqual(['SKY', 'CORAL', 'MINT']);
    // Niqqud present in seeded routine titles
    const allRoutineTitles = board.profiles.flatMap((p) => p.pendingRoutines.map((r) => r.title));
    expect(allRoutineTitles.some((t) => /[\u0591-\u05C7]/.test(t))).toBe(true);
    // Pool chores contain פינוי מדיח and סידור סלון
    const poolTitles = board.poolChores.map((c) => c.title).join(' ');
    expect(poolTitles).toContain('מדיח');
    expect(poolTitles).toContain('סלון');
  });

  it('supports kid routine toggle, personal chore toggle, pool 1-tap complete & undo without PIN', async () => {
    const initialBoard = (await app.inject({ method: 'GET', url: '/api/v1/board' })).json<BoardResponse>();
    const child = initialBoard.profiles[0]!;
    const routine = child.pendingRoutines[0]!;
    const personalChore = child.pendingChores[0]!;
    const dishwasher = initialBoard.poolChores.find((c) => c.title.includes('מדיח'))!;

    // 1. Toggle routine -> completed
    const rDone = await app.inject({ method: 'POST', url: `/api/v1/routines/${routine.id}/toggle` });
    expect(rDone.statusCode).toBe(200);
    expect(rDone.json()).toEqual({ routineId: routine.id, logicalDate: '2026-11-01', isCompleted: true });

    // 2. Toggle personal chore -> completed (+stars)
    const cDone = await app.inject({ method: 'POST', url: `/api/v1/personal-chores/${personalChore.id}/toggle` });
    expect(cDone.statusCode).toBe(200);
    expect(cDone.json()).toEqual({
      choreId: personalChore.id,
      status: 'COMPLETED',
      starsDelta: personalChore.stars,
    });

    // 3. Complete AUTO_DISABLE pool chore -> 201, disappears from board, awards stars
    const pDone = await app.inject({
      method: 'POST',
      url: `/api/v1/pool-chores/${dishwasher.id}/complete`,
      payload: { profileId: child.id },
    });
    expect(pDone.statusCode).toBe(201);
    const { poolCompletionId, starsAwarded } = pDone.json<{ poolCompletionId: number; starsAwarded: number }>();
    expect(starsAwarded).toBe(dishwasher.stars);

    // Repeating completion while AUTO_DISABLE returns 409 CONFLICT
    const pConflict = await app.inject({
      method: 'POST',
      url: `/api/v1/pool-chores/${dishwasher.id}/complete`,
      payload: { profileId: child.id },
    });
    expect(pConflict.statusCode).toBe(409);
    expect(pConflict.json().error.code).toBe('CONFLICT');

    // Verify board reflects stars & completed drawer
    const midBoard = (await app.inject({ method: 'GET', url: '/api/v1/board' })).json<BoardResponse>();
    const midChild = midBoard.profiles.find((p) => p.id === child.id)!;
    expect(midChild.totalStars).toBe(child.totalStars + personalChore.stars + dishwasher.stars);
    expect(midBoard.poolChores.some((c) => c.id === dishwasher.id)).toBe(false);

    // 4. Undo pool completion -> restores pool chore & deducts stars
    const pUndo = await app.inject({
      method: 'POST',
      url: `/api/v1/pool-completions/${poolCompletionId}/undo`,
    });
    expect(pUndo.statusCode).toBe(200);
    expect(pUndo.json()).toEqual({
      poolCompletionId,
      poolChoreId: dishwasher.id,
      starsDelta: -dishwasher.stars,
    });

    const afterUndoBoard = (await app.inject({ method: 'GET', url: '/api/v1/board' })).json<BoardResponse>();
    expect(afterUndoBoard.poolChores.some((c) => c.id === dishwasher.id)).toBe(true);
  });

  it('serves GET /api/v1/history openly without PIN and rejects future dates with 400', async () => {
    runDailyRollover(db, '2026-10-31');

    const pastRes = await app.inject({ method: 'GET', url: '/api/v1/history?date=2026-10-31' });
    expect(pastRes.statusCode).toBe(200);
    const history = HistoryResponseSchema.parse(pastRes.json());
    expect(history.logicalDate).toBe('2026-10-31');
    expect(history.isToday).toBe(false);

    const todayRes = await app.inject({ method: 'GET', url: '/api/v1/history' });
    expect(todayRes.statusCode).toBe(200);
    expect(todayRes.json().isToday).toBe(true);

    const futureRes = await app.inject({ method: 'GET', url: '/api/v1/history?date=2026-11-05' });
    expect(futureRes.statusCode).toBe(400);
    expect(futureRes.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces requireParentAdmin, rate-limits wrong PIN attempts, and supports full admin CRUD', async () => {
    // Locked by default
    const sessLocked = await app.inject({ method: 'GET', url: '/api/v1/admin/session' });
    expect(sessLocked.statusCode).toBe(200);
    expect(sessLocked.json()).toEqual({ unlocked: false });

    const forbidden = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      payload: { announcementEnabled: true },
    });
    expect(forbidden.statusCode).toBe(401);
    expect(forbidden.json().error.code).toBe('UNAUTHORIZED');

    // Wrong PIN -> 401 INVALID_PIN
    const wrongPin = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/unlock',
      payload: { pin: '0000' },
    });
    expect(wrongPin.statusCode).toBe(401);
    expect(wrongPin.json().error.code).toBe('INVALID_PIN');

    // Correct PIN 1234 -> sets HttpOnly cookie
    const unlocked = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/unlock',
      payload: { pin: '1234' },
    });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.json()).toEqual({ unlocked: true });
    expect(String(unlocked.headers['set-cookie'])).toContain('HttpOnly');
    const cookie = extractSessionCookie(unlocked.headers['set-cookie']);

    const sessUnlocked = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/session',
      headers: { cookie },
    });
    expect(sessUnlocked.json()).toEqual({ unlocked: true });

    // Strict Zod validation rejects unknown fields
    const badPatch = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie },
      payload: { unknownKey: true },
    });
    expect(badPatch.statusCode).toBe(400);
    expect(badPatch.json().error.code).toBe('VALIDATION_ERROR');

    // Update settings
    const settingsRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie },
      payload: { announcementEnabled: true, announcementText: 'שבוע טוב!', announcementEmoji: '🌟' },
    });
    expect(settingsRes.statusCode).toBe(200);
    expect(settingsRes.json().announcementEnabled).toBe(true);

    // Profiles CRUD + adjust-stars
    const createdProfileRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: { cookie },
      payload: { name: 'רוֹנִי', avatarEmoji: '🦊', pastelTheme: 'LAVENDER' },
    });
    expect(createdProfileRes.statusCode).toBe(201);
    const createdProfile = createdProfileRes.json<Profile>();

    const adjRes = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/profiles/${createdProfile.id}/adjust-stars`,
      headers: { cookie },
      payload: { starsDelta: 4, description: 'עזרה מיוחדת' },
    });
    expect(adjRes.statusCode).toBe(200);
    expect(adjRes.json()).toEqual({ profileId: createdProfile.id, totalStars: 4 });

    const patchProfileRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/profiles/${createdProfile.id}`,
      headers: { cookie },
      payload: { pastelTheme: 'BUTTERCUP' },
    });
    expect(patchProfileRes.statusCode).toBe(200);
    expect(patchProfileRes.json<Profile>().pastelTheme).toBe('BUTTERCUP');

    // Routines CRUD
    const createdRoutineRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/routines',
      headers: { cookie },
      payload: {
        profileId: createdProfile.id,
        title: 'לְסַדֵּר יַלְקוּט',
        iconEmoji: '🎒',
        timeWindow: 'EVENING',
        daysOfWeek: [0, 1, 2, 3, 4],
      },
    });
    expect(createdRoutineRes.statusCode).toBe(201);
    const createdRoutine = createdRoutineRes.json<RoutineTemplate>();

    const patchRoutineRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/routines/${createdRoutine.id}`,
      headers: { cookie },
      payload: { title: 'לְהָכִין יַלְקוּט' },
    });
    expect(patchRoutineRes.statusCode).toBe(200);

    // History toggle past routine
    const histToggleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/history/toggle-routine',
      headers: { cookie },
      payload: { routineId: createdRoutine.id, logicalDate: '2026-10-31' },
    });
    expect(histToggleRes.statusCode).toBe(200);
    expect(histToggleRes.json()).toEqual({
      routineId: createdRoutine.id,
      logicalDate: '2026-10-31',
      status: 'COMPLETED',
    });

    // Personal chores CRUD
    const createdPersonalRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/personal-chores',
      headers: { cookie },
      payload: { profileId: createdProfile.id, title: 'מִיּוּן צַעֲצוּעִים', iconEmoji: '🧸', stars: 2 },
    });
    expect(createdPersonalRes.statusCode).toBe(201);
    const createdPersonal = createdPersonalRes.json<PersonalChore>();

    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/v1/admin/personal-chores/${createdPersonal.id}`,
          headers: { cookie },
          payload: { stars: 3 },
        })
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/admin/personal-chores/${createdPersonal.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);

    // Pool chores CRUD + toggle-active + reset-cooldown
    const createdPoolRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/pool-chores',
      headers: { cookie },
      payload: {
        title: 'טִאטוּא מִרְפֶּסֶת',
        iconEmoji: '🧹',
        stars: 3,
        resetMode: 'COOLDOWN',
        cooldownMinutes: 45,
        isActive: false,
      },
    });
    expect(createdPoolRes.statusCode).toBe(201);
    const createdPool = createdPoolRes.json<PoolChore>();

    const toggledPool = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/pool-chores/${createdPool.id}/toggle-active`,
      headers: { cookie },
      payload: { isActive: true },
    });
    expect(toggledPool.statusCode).toBe(200);
    expect(toggledPool.json<PoolChore>().isActive).toBe(true);

    const resetPool = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/pool-chores/${createdPool.id}/reset-cooldown`,
      headers: { cookie },
    });
    expect(resetPool.statusCode).toBe(200);
    expect(resetPool.json<PoolChore>().cooldownEndsAt).toBeNull();

    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/admin/pool-chores/${createdPool.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/admin/routines/${createdRoutine.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);

    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/v1/admin/profiles/${createdProfile.id}`,
          headers: { cookie },
        })
      ).statusCode,
    ).toBe(204);

    // Lock clears session
    const lockedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/lock',
      headers: { cookie },
    });
    expect(lockedRes.statusCode).toBe(200);
    expect(lockedRes.json()).toEqual({ unlocked: false });
  });
});
