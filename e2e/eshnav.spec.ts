import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';
import { buildApp } from '../packages/server/src/app.js';
import { REPO_ROOT, openDatabase } from '../packages/server/src/db/connection.js';
import { seedFamilyData } from '../packages/server/src/db/seed-data.js';
import { runCatchUpRollover } from '../packages/server/src/services/rollover.service.js';

// Sat 2026-10-31 08:00 IST -> seeds routines created yesterday so Sunday catch-up seals yesterday's history
const SEED_CREATED_AT = Date.UTC(2026, 9, 31, 6, 0);
// Sun 2026-11-01 09:30 IST -> Morning window active
const SUN_MORNING = Date.UTC(2026, 10, 1, 7, 30);
// Sun 2026-11-01 14:00 IST -> Afternoon window active, Morning window elapsed
const SUN_AFTERNOON = Date.UTC(2026, 10, 1, 12, 0);

interface ServerFixture {
  baseUrl: string;
  setClock: (nextNow: number) => void;
}

const test = base.extend<{ server: ServerFixture }>({
  server: async ({}, use) => {
    const webDistDir = path.join(REPO_ROOT, 'packages', 'web', 'dist');
    if (!existsSync(path.join(webDistDir, 'index.html'))) {
      throw new Error('Missing packages/web/dist/index.html — run `npm run build` before E2E tests.');
    }

    const tempDir = mkdtempSync(path.join(tmpdir(), 'eshnav-e2e-'));
    const db = openDatabase(path.join(tempDir, 'eshnav.db'));
    let currentNow = SUN_MORNING;

    seedFamilyData(db, SEED_CREATED_AT);
    runCatchUpRollover(db, currentNow);

    const app = await buildApp({
      db,
      sessionSecret: 'e'.repeat(64),
      clock: () => currentNow,
      webDistDir,
    });

    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    try {
      await use({
        baseUrl: address,
        setClock: (nextNow: number) => {
          currentNow = nextNow;
        },
      });
    } finally {
      await app.close();
      db.$client.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  },
});

async function enterParentPin(page: Page, pin = '1234') {
  await expect(page.getByTestId('pin-modal')).toBeVisible();
  for (const digit of pin) {
    await page.getByTestId(`pin-key-${digit}`).click();
  }
  await expect(page.getByTestId('pin-modal')).toBeHidden();
}

test.describe('eshnav Skylight Family Chore Board — E2E Verification', () => {
  test('Flow 1: Zero-Login Skylight Board, native RTL with zero banned physical classes, and 1-tap routine completion & uncheck', async ({
    page,
    server,
  }) => {
    await page.goto(server.baseUrl);

    // 1. Verify Hebrew RTL document & computed direction
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    const computedDir = await page.locator('html').evaluate((el) => getComputedStyle(el).direction);
    expect(computedDir).toBe('rtl');

    // 2. Verify zero login friction & 3 distinct pastel child columns (SKY, CORAL, MINT)
    await expect(page.getByTestId('app-title')).toHaveText('הבית שלנו');
    await expect(page.locator('[data-pastel-theme="SKY"]')).toBeVisible();
    await expect(page.locator('[data-pastel-theme="CORAL"]')).toBeVisible();
    await expect(page.locator('[data-pastel-theme="MINT"]')).toBeVisible();

    // 3. Assert ZERO banned physical horizontal directional Tailwind classes anywhere in the rendered DOM
    const offendingClasses = await page.evaluate(() => {
      const banned =
        /^(pl-|pr-|ml-|mr-|left-|right-|text-left$|text-right$|border-l-|border-r-|rounded-l-|rounded-r-)/;
      const found: string[] = [];
      for (const el of document.querySelectorAll('*')) {
        const cls = typeof el.className === 'string' ? el.className : '';
        for (const token of cls.split(/\s+/).filter(Boolean)) {
          const core = token.includes(':') ? token.split(':').pop()! : token;
          if (banned.test(core)) found.push(token);
        }
      }
      return found;
    });
    expect(offendingClasses).toEqual([]);

    // 4. 1-tap routine completion on child 1 -> moves into "הושלמו היום (1)" -> 1-tap uncheck restores it
    const childCol = page.getByTestId('child-column-1');
    const firstRoutine = childCol.locator('[data-testid^="routine-card-"]').first();
    const routineTestId = await firstRoutine.getAttribute('data-testid');
    expect(routineTestId).toBeTruthy();

    await firstRoutine.getByRole('button').click();
    await expect(childCol.getByTestId(routineTestId!)).toBeHidden();

    const drawerToggle = page.getByTestId('completed-drawer-toggle-1');
    await expect(drawerToggle).toContainText('הושלמו היום (1)');
    await drawerToggle.click();

    const completedList = page.getByTestId('completed-drawer-list-1');
    await expect(completedList).toBeVisible();
    await completedList.locator('[data-testid^="completed-item-ROUTINE-"]').first().getByRole('button').click();

    // Routine is restored to active list and drawer disappears when 0 items remain
    await expect(childCol.getByTestId(routineTestId!)).toBeVisible();
    await expect(drawerToggle).toBeHidden();
  });

  test('Flow 2: Dual-Color Progress Rings — active Green/Grey vs elapsed Green/Red & completing overdue window', async ({
    page,
    server,
  }) => {
    // At 09:30 (MORNING active), complete 1 of 2 morning routines for Noa (child 1)
    await page.goto(server.baseUrl);
    const childCol = page.getByTestId('child-column-1');
    const morningRing = childCol.getByTestId('ring-MORNING');

    await expect(morningRing).toHaveAttribute('data-elapsed', 'false');
    await expect(morningRing).toHaveAttribute('data-total', '2');
    await expect(morningRing).toHaveAttribute('data-remaining', '2');

    // Complete 1 morning routine -> Green (#10B981) + Soft Grey (#E5E7EB)
    await childCol.locator('[data-testid^="routine-card-"]').first().getByRole('button').click();
    await expect(morningRing).toHaveAttribute('data-completed', '1');
    await expect(morningRing).toHaveAttribute('data-remaining', '1');
    await expect(morningRing).toHaveAttribute('data-missed', '0');
    await expect(morningRing.locator('circle').first()).toHaveAttribute('data-ring-track-color', '#E5E7EB');
    await expect(morningRing.locator('circle').nth(1)).toHaveAttribute('data-ring-completed-color', '#10B981');

    // Advance clock to 14:00 (AFTERNOON active, MORNING elapsed)
    server.setClock(SUN_AFTERNOON);
    await page.reload();

    // Morning ring is now elapsed -> Dual-Color Green (#10B981) + Red/Rose (#F43F5E)!
    await expect(morningRing).toHaveAttribute('data-elapsed', 'true');
    await expect(morningRing).toHaveAttribute('data-completed', '1');
    await expect(morningRing).toHaveAttribute('data-missed', '1');
    await expect(morningRing).toHaveAttribute('data-remaining', '0');
    await expect(morningRing.locator('circle').first()).toHaveAttribute('data-ring-track-color', '#F43F5E');
    await expect(morningRing.locator('circle').nth(1)).toHaveAttribute('data-ring-completed-color', '#10B981');

    // Afternoon ring is active (not elapsed) -> Soft Grey (#E5E7EB)
    const afternoonRing = childCol.getByTestId('ring-AFTERNOON');
    await expect(afternoonRing).toHaveAttribute('data-elapsed', 'false');
    await expect(afternoonRing.locator('circle').first()).toHaveAttribute('data-ring-track-color', '#E5E7EB');

    // Child taps the elapsed Morning ring to finish the overdue morning routine today -> 100% Green + celebration!
    await morningRing.click();
    await childCol.locator('[data-testid^="routine-card-"]').first().getByRole('button').click();
    await expect(morningRing).toHaveAttribute('data-completed', '2');
    await expect(morningRing).toHaveAttribute('data-missed', '0');
    await expect(page.getByTestId('window-celebration-1')).toContainText('כל הכבוד');
  });

  test('Flow 3: קופת המשימות 1-Tap "Did It!" & Undo — awards stars, auto-disables chore, and restores on undo', async ({
    page,
    server,
  }) => {
    await page.goto(server.baseUrl);

    const poolCol = page.getByTestId('pool-column');
    await expect(poolCol).toContainText('פינוי מדיח');
    await expect(page.getByTestId('child-stars-1')).toContainText('0');

    // Tap check circle on "פינוי מדיח" (+3 stars, AUTO_DISABLE)
    const dishwasherCard = poolCol.locator('[data-testid^="pool-chore-card-"]', { hasText: 'פינוי מדיח' });
    await dishwasherCard.getByRole('button').click();

    // Select Noa (child 1) in "מי אלוף הבית שביצע את המשימה?" modal
    const modal = page.getByTestId('who-did-it-modal');
    await expect(modal).toContainText('מי אלוף הבית שביצע את המשימה?');
    await page.getByTestId('who-did-it-avatar-1').click();
    await expect(modal).toBeHidden();

    // Stars increase to 3 and AUTO_DISABLE chore disappears from active pool
    await expect(page.getByTestId('child-stars-1')).toContainText('3');
    await expect(poolCol).not.toContainText('פינוי מדיח');

    // Undo from Noa's "הושלמו היום (1)" drawer -> stars return to 0 and "פינוי מדיח" returns to קופת המשימות
    await page.getByTestId('completed-drawer-toggle-1').click();
    const poolDoneCard = page
      .getByTestId('completed-drawer-list-1')
      .locator('[data-testid^="completed-item-POOL_COMPLETION-"]');
    await poolDoneCard.getByRole('button').click();

    await expect(page.getByTestId('child-stars-1')).toContainText('0');
    await expect(poolCol).toContainText('פינוי מדיח');
  });

  test('Flow 4: 📆 History Screen Read-Only when locked vs. Parent Edit when unlocked with PIN 1234', async ({
    page,
    server,
  }) => {
    await page.goto(server.baseUrl);

    // Open History screen without PIN
    await page.getByTestId('history-nav-btn').click();
    await expect(page.getByTestId('history-view')).toBeVisible();
    await expect(page.getByTestId('history-mode-badge')).toHaveText('צפייה בלבד');

    // Yesterday (2026-10-31) has sealed missed routines ("❌ לא בוצע") and is read-only when locked
    const childHistory = page.getByTestId('history-child-1');
    const firstHistoryRoutine = childHistory.locator('[data-testid^="history-routine-"]').first();
    await expect(firstHistoryRoutine).toHaveAttribute('data-status', 'MISSED');
    await expect(firstHistoryRoutine).toContainText('לא בוצע');
    await expect(firstHistoryRoutine).toBeDisabled();

    // Unlock Parent Mode directly inside History with PIN 1234
    await page.getByTestId('history-lock-btn').click();
    await enterParentPin(page, '1234');
    await expect(page.getByTestId('history-mode-badge')).toHaveText('מצב עריכת הורים פעיל');

    // Tap the missed past routine -> toggles to COMPLETED ("✅ בוצע")!
    await expect(firstHistoryRoutine).toBeEnabled();
    await firstHistoryRoutine.click();
    await expect(firstHistoryRoutine).toHaveAttribute('data-status', 'COMPLETED');
    await expect(firstHistoryRoutine).toContainText('בוצע');
  });

  test('Flow 5: Parent Admin Switchboard & Family Announcement Banner Toggle', async ({
    page,
    server,
  }) => {
    await page.goto(server.baseUrl);

    // Banner is completely hidden by default
    await expect(page.getByTestId('family-announcement-banner')).toHaveCount(0);

    // Complete AUTO_DISABLE "פינוי מדיח" so it turns off
    const poolCol = page.getByTestId('pool-column');
    await poolCol.locator('[data-testid^="pool-chore-card-"]', { hasText: 'פינוי מדיח' }).getByRole('button').click();
    await page.getByTestId('who-did-it-avatar-2').click();
    await expect(poolCol).not.toContainText('פינוי מדיח');

    // Unlock Parent Admin (🔒 -> PIN 1234 -> ניהול הבית opens)
    await page.getByTestId('parent-lock-btn').click();
    await enterParentPin(page, '1234');
    const drawer = page.getByTestId('admin-drawer');
    await expect(drawer).toBeVisible();

    // Re-enable "פינוי מדיח" via the 1-tap switchboard
    const dishwasherRow = drawer.locator('[data-testid^="admin-pool-row-"]', { hasText: 'פינוי מדיח' });
    const dishwasherSwitch = dishwasherRow.getByRole('switch');
    await expect(dishwasherSwitch).toHaveText('כבוי');
    await dishwasherSwitch.click();
    await expect(dishwasherSwitch).toHaveText('פעיל');

    // Switch to Announcement tab, enter text, and enable banner
    await page.getByTestId('admin-tab-announcement').click();
    await page.getByTestId('admin-banner-text').fill('היום ערב סרט ופופקורן!');
    await page.getByTestId('admin-banner-switch').click();
    await expect(page.getByTestId('admin-banner-switch')).toHaveText('פעיל');
    await page.getByTestId('admin-close-btn').click();

    // Verify immediate board update: both banner and re-enabled "פינוי מדיח" are visible!
    await expect(page.getByTestId('family-announcement-banner')).toContainText('היום ערב סרט ופופקורן!');
    await expect(poolCol).toContainText('פינוי מדיח');

    // Re-open Admin Drawer and toggle banner off -> banner consumes 0 DOM elements
    await page.getByTestId('open-admin-drawer-btn').click();
    await page.getByTestId('admin-tab-announcement').click();
    await page.getByTestId('admin-banner-switch').click();
    await page.getByTestId('admin-close-btn').click();
    await expect(page.getByTestId('family-announcement-banner')).toHaveCount(0);
  });
});
