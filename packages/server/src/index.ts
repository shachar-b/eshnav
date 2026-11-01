import { TIMEZONE, getLogicalDateString } from '@eshnav/shared';
import { buildApp } from './app.js';
import { openDatabase } from './db/connection.js';
import { seedFamilyData } from './db/seed-data.js';
import { ensureAppSettings, resolveSessionSecret } from './services/admin.service.js';
import { runCatchUpRollover } from './services/rollover.service.js';

process.env.TZ = TIMEZONE;

function resolveClock(): () => number {
  if (process.env.NODE_ENV !== 'production' && process.env.ESHNAV_FIXED_NOW) {
    const fixed = Number(process.env.ESHNAV_FIXED_NOW);
    if (Number.isFinite(fixed) && fixed > 0) return () => fixed;
  }
  return () => Date.now();
}

async function main() {
  const sessionSecret = resolveSessionSecret(process.env);
  const clock = resolveClock();
  const db = openDatabase();

  if (process.env.ESHNAV_AUTO_SEED === '1') {
    seedFamilyData(db, clock());
  } else {
    ensureAppSettings(db, '1234', clock());
  }

  runCatchUpRollover(db, clock());

  let lastLogicalDate = getLogicalDateString(clock());
  const rolloverTimer = setInterval(() => {
    const now = clock();
    const currentLogicalDate = getLogicalDateString(now);
    if (currentLogicalDate !== lastLogicalDate) {
      lastLogicalDate = currentLogicalDate;
      runCatchUpRollover(db, now);
    }
  }, 30_000);
  rolloverTimer.unref();

  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '0.0.0.0';
  const app = await buildApp({
    db,
    sessionSecret,
    clock,
    logger: process.env.NODE_ENV !== 'test',
  });

  const shutdown = async () => {
    clearInterval(rolloverTimer);
    await app.close();
    db.$client.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await app.listen({ port, host });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
