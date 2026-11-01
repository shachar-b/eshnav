import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  AdjustStarsBodySchema,
  CompletePoolChoreBodySchema,
  CreatePersonalChoreBodySchema,
  CreatePoolChoreBodySchema,
  CreateProfileBodySchema,
  CreateRoutineBodySchema,
  HistoryQuerySchema,
  IdParamsSchema,
  ToggleHistoryRoutineBodySchema,
  TogglePoolChoreActiveBodySchema,
  UnlockBodySchema,
  UpdatePersonalChoreBodySchema,
  UpdatePoolChoreBodySchema,
  UpdateProfileBodySchema,
  UpdateRoutineBodySchema,
  UpdateSettingsBodySchema,
  getLogicalDateString,
} from '@eshnav/shared';
import { REPO_ROOT, type AppDb } from './db/connection.js';
import {
  PinRateLimiter,
  adjustProfileStars,
  createPersonalChore,
  createPoolChore,
  createProfile,
  createRoutine,
  deletePersonalChore,
  deletePoolChore,
  deleteProfile,
  deleteRoutine,
  listPersonalChores,
  listPoolChores,
  listProfiles,
  listRoutines,
  resetPoolChoreCooldown,
  togglePoolChoreActive,
  unlockParentAdmin,
  updateAppSettings,
  updatePersonalChore,
  updatePoolChore,
  updateProfile,
  updateRoutine,
  verifyAdminSessionToken,
} from './services/admin.service.js';
import { getFamilyBoard } from './services/board.service.js';
import { DomainError } from './services/errors.js';
import { getDailyHistory, togglePastRoutineStatus } from './services/history.service.js';
import { completePoolChore, undoPoolCompletion } from './services/pool.service.js';
import { togglePersonalChore, toggleRoutineForToday } from './services/task.service.js';

export const ADMIN_COOKIE_NAME = 'eshnav_admin_session';

export interface BuildAppOptions {
  db: AppDb;
  sessionSecret: string;
  clock?: () => number;
  webDistDir?: string;
  logger?: boolean;
}

function parseSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const field = firstIssue && firstIssue.path.length > 0 ? `${firstIssue.path.join('.')}: ` : '';
    throw new DomainError('VALIDATION_ERROR', `${field}${firstIssue?.message ?? 'קלט לא תקין'}`);
  }
  return parsed.data;
}

function extractAdminToken(req: FastifyRequest): string | undefined {
  const cookieToken = req.cookies[ADMIN_COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return undefined;
}

function isHttpsRequest(req: FastifyRequest): boolean {
  return req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const {
    db,
    sessionSecret,
    clock = () => Date.now(),
    webDistDir = path.join(REPO_ROOT, 'packages', 'web', 'dist'),
    logger = false,
  } = options;

  const app = Fastify({ logger });
  const pinRateLimiter = new PinRateLimiter(5, 60_000);

  await app.register(fastifyCookie);

  app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
    if (err instanceof DomainError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message } });
    }
    if (err.statusCode === 400) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: err.message } });
    }
    app.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'שגיאת שרת פנימית' } });
  });

  const requireParentAdmin = async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = extractAdminToken(req);
    if (!verifyAdminSessionToken(token, sessionSecret, clock())) {
      throw new DomainError('UNAUTHORIZED', 'נדרשת פתיחת נעילת הורים');
    }
  };

  // ─── Public Board, Kid Actions & History ───────────────────────────────────

  app.get('/api/v1/board', async () => {
    return getFamilyBoard(db, clock());
  });

  app.post('/api/v1/routines/:id/toggle', async (req) => {
    const { id } = parseSchema(IdParamsSchema, req.params);
    return toggleRoutineForToday(db, id, clock());
  });

  app.post('/api/v1/personal-chores/:id/toggle', async (req) => {
    const { id } = parseSchema(IdParamsSchema, req.params);
    return togglePersonalChore(db, id, clock());
  });

  app.post('/api/v1/pool-chores/:id/complete', async (req, reply) => {
    const { id } = parseSchema(IdParamsSchema, req.params);
    const { profileId } = parseSchema(CompletePoolChoreBodySchema, req.body);
    const result = completePoolChore(db, id, profileId, clock());
    return reply.code(201).send(result);
  });

  app.post('/api/v1/pool-completions/:id/undo', async (req) => {
    const { id } = parseSchema(IdParamsSchema, req.params);
    return undoPoolCompletion(db, id, clock());
  });

  app.get('/api/v1/history', async (req) => {
    const now = clock();
    const { date } = parseSchema(HistoryQuerySchema, req.query);
    return getDailyHistory(db, date ?? getLogicalDateString(now), now);
  });

  // ─── Parent Admin Session ──────────────────────────────────────────────────

  app.get('/api/v1/admin/session', async (req) => {
    const token = extractAdminToken(req);
    return { unlocked: verifyAdminSessionToken(token, sessionSecret, clock()) };
  });

  app.post('/api/v1/admin/unlock', async (req, reply) => {
    const { pin } = parseSchema(UnlockBodySchema, req.body);
    const now = clock();
    const { token } = unlockParentAdmin(db, pin, sessionSecret, now, pinRateLimiter, req.ip);
    reply.setCookie(ADMIN_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 60 * 60,
      secure: isHttpsRequest(req),
    });
    return { unlocked: true };
  });

  app.post('/api/v1/admin/lock', async (req, reply) => {
    reply.clearCookie(ADMIN_COOKIE_NAME, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: isHttpsRequest(req),
    });
    return { unlocked: false };
  });

  // ─── Protected Parent Admin Endpoints ──────────────────────────────────────

  await app.register(async (admin) => {
    admin.addHook('preHandler', requireParentAdmin);

    admin.patch('/api/v1/admin/settings', async (req) => {
      const body = parseSchema(UpdateSettingsBodySchema, req.body);
      return updateAppSettings(db, body, clock());
    });

    // Profiles
    admin.get('/api/v1/admin/profiles', async () => listProfiles(db));

    admin.post('/api/v1/admin/profiles', async (req, reply) => {
      const body = parseSchema(CreateProfileBodySchema, req.body);
      return reply.code(201).send(createProfile(db, body, clock()));
    });

    admin.patch('/api/v1/admin/profiles/:id', async (req) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      const body = parseSchema(UpdateProfileBodySchema, req.body);
      return updateProfile(db, id, body);
    });

    admin.delete('/api/v1/admin/profiles/:id', async (req, reply) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      deleteProfile(db, id);
      return reply.code(204).send();
    });

    admin.post('/api/v1/admin/profiles/:id/adjust-stars', async (req) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      const body = parseSchema(AdjustStarsBodySchema, req.body);
      return adjustProfileStars(db, id, body, clock());
    });

    // Routines
    admin.get('/api/v1/admin/routines', async () => listRoutines(db));

    admin.post('/api/v1/admin/routines', async (req, reply) => {
      const body = parseSchema(CreateRoutineBodySchema, req.body);
      return reply.code(201).send(createRoutine(db, body, clock()));
    });

    admin.patch('/api/v1/admin/routines/:id', async (req) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      const body = parseSchema(UpdateRoutineBodySchema, req.body);
      return updateRoutine(db, id, body);
    });

    admin.delete('/api/v1/admin/routines/:id', async (req, reply) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      deleteRoutine(db, id);
      return reply.code(204).send();
    });

    // Personal Chores
    admin.get('/api/v1/admin/personal-chores', async () => listPersonalChores(db));

    admin.post('/api/v1/admin/personal-chores', async (req, reply) => {
      const body = parseSchema(CreatePersonalChoreBodySchema, req.body);
      return reply.code(201).send(createPersonalChore(db, body, clock()));
    });

    admin.patch('/api/v1/admin/personal-chores/:id', async (req) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      const body = parseSchema(UpdatePersonalChoreBodySchema, req.body);
      return updatePersonalChore(db, id, body);
    });

    admin.delete('/api/v1/admin/personal-chores/:id', async (req, reply) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      deletePersonalChore(db, id);
      return reply.code(204).send();
    });

    // Pool Chores & Switchboard
    admin.get('/api/v1/admin/pool-chores', async () => listPoolChores(db));

    admin.post('/api/v1/admin/pool-chores', async (req, reply) => {
      const body = parseSchema(CreatePoolChoreBodySchema, req.body);
      return reply.code(201).send(createPoolChore(db, body, clock()));
    });

    admin.patch('/api/v1/admin/pool-chores/:id', async (req) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      const body = parseSchema(UpdatePoolChoreBodySchema, req.body);
      return updatePoolChore(db, id, body);
    });

    admin.delete('/api/v1/admin/pool-chores/:id', async (req, reply) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      deletePoolChore(db, id);
      return reply.code(204).send();
    });

    admin.patch('/api/v1/admin/pool-chores/:id/toggle-active', async (req) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      const { isActive } = parseSchema(TogglePoolChoreActiveBodySchema, req.body);
      return togglePoolChoreActive(db, id, isActive);
    });

    admin.post('/api/v1/admin/pool-chores/:id/reset-cooldown', async (req) => {
      const { id } = parseSchema(IdParamsSchema, req.params);
      return resetPoolChoreCooldown(db, id);
    });

    // History correction
    admin.post('/api/v1/admin/history/toggle-routine', async (req) => {
      const { routineId, logicalDate } = parseSchema(ToggleHistoryRoutineBodySchema, req.body);
      return togglePastRoutineStatus(db, routineId, logicalDate, clock());
    });
  });

  // ─── Single-Origin Production SPA Static Serving ───────────────────────────

  if (existsSync(path.join(webDistDir, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDistDir,
      prefix: '/',
      wildcard: false,
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'נתיב לא נמצא' } });
      }
      return reply.sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'נתיב לא נמצא' } });
    });
  }

  return app;
}
