# `eshnav` (אשנב / הבית שלנו) — Master Architecture & Implementation Specification

## 0. Agent Execution Protocol, Model Strategy & Skill Routing

You are building **`eshnav`** ("אשנב" — Hebrew for *Skylight*), a production-grade, local-first, Hebrew RTL family routine and chore board web application modeled directly on the **Skylight Calendar Tasks/Chores UX**. Its primary design goal is **radical visual simplicity, zero-login friction, pastel color-coded clarity, and joyful micro-celebrations** for children (ages 6+).

### Mandatory Engineering Discipline
1. **Strict TDD (Red-Green-Refactor):** Every backend domain service and API route MUST begin with a failing Vitest test (`Red`), followed by the minimal implementation to pass (`Green`), and clean refactoring (`Refactor`).
2. **Zero Business Logic in Transport/UI:** Fastify HTTP routes and React components must never contain raw database queries or domain state rules. All state transitions flow through tested Domain Services wrapped in synchronous `better-sqlite3` transactions (`db.transaction((tx) => ...)`).
3. **Minimalist & Safe Code (`Ponytail` Discipline):** Ship the smallest, cleanest, type-safe implementation that satisfies the spec. Zero `any` types, strict Zod validation at every boundary, and zero unrequested features.
4. **Hebrew-First & Native RTL:** The UI is 100% Hebrew (`he-IL`, `dir="rtl"`). Use Tailwind CSS logical properties (`ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*`, `text-start`, `border-s-*`, `rounded-s-*`, `rounded-e-*`) exclusively. Physical horizontal directional classes (`pl-*`, `pr-*`, `ml-*`, `mr-*`, `left-*`, `right-*`, `text-left`, `text-right`, `border-l-*`, `border-r-*`, `rounded-l-*`, `rounded-r-*`) are **STRICTLY BANNED**.

### Installed Skills & Activation Matrix
Use the pre-installed Global and Workspace skills according to the active phase:

| Scope | Skill / Plugin | Activation Phase & Responsibility |
| :--- | :--- | :--- |
| **Global Plugin** | `Superpowers Skills` | All Milestones — Enforces planning, strict TDD cycle, debugging, and verification gates. |
| **Global Skill** | `Matt Pocock Handoff` | End of Milestone 1 & Milestone 6 — Packages workspace state into `HANDOFF.md` before model switches. |
| **Global Skill** | `Ponytail Skill` | All Milestones — Prevents over-engineering while enforcing validation, security, and data-safety floors. |
| **Global Skill** | `Caveman Skill` | Phase 1 (Opus 5.5) — Keep conversational prose terse to conserve output tokens; never truncate code or tests. |
| **Workspace** | `database-architect` | Milestone 1 — SQLite WAL configuration, Drizzle schema, indexes, immutable ledger, and snapshot modeling. |
| **Workspace** | `api-design-principles` | Milestone 1 & 3 — Clean REST resource contracts, status codes, and decoupled service boundaries. |
| **Workspace** | `typescript-pro` | All Milestones — Discriminated unions, strict generics, and shared Zod-to-TS type inference. |
| **Workspace** | `Frontend Design` | Milestone 4 & 5 — Pastel Skylight-inspired visual system, metallic Gold pool column, typography, and RTL layout. |
| **Workspace** | `Emil Kowalski Design Eng` | Milestone 4 & 5 — Purposeful micro-interactions, SVG progress rings, confetti/audio celebrations, and touch responsiveness. |
| **Workspace** | `e2e-testing-patterns` | Milestone 6 — Resilient Playwright E2E flows covering the open board, 1-tap pool completion, rings, history, and parent lock. |

---

## 1. System Architecture & Proxmox LXC Context

### 1.1 Target Runtime Environment
* **Host Hardware:** Intel N150 Mini PC running Proxmox VE (co-hosted alongside Home Assistant, Plex, and AdGuard Home).
* **Container Target:** Unprivileged Debian 12 LXC container (`hostname: eshnav`).
* **Resource Budget:** Idle RAM consumption must remain `< 120 MB`; idle CPU `< 1%`.
* **Timezone Mandate:** The server process and all scheduled jobs MUST operate strictly in `TZ=Asia/Jerusalem`.
  * **CRITICAL TIMEZONE RULE:** Never use `new Date().toISOString().slice(0, 10)` on wall-clock timestamps to compute local dates (as `toISOString()` uses UTC and causes a 2–3 hour drift in Israel). Always resolve `YYYY-MM-DD` and current hours via `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23' })`. For calendar date arithmetic (`shiftLogicalDate`), operate exclusively on synthetic UTC noon anchors (`Date.UTC(year, month - 1, day, 12, 0, 0)`), which are immune to DST transitions.
* **Single-Origin Serving (LAN & Cloudflare Tunnel Ready):**
  * In production mode, the Fastify server serves the compiled Vite SPA bundle from `/` and mounts REST endpoints under `/api/v1/*` on the same port (`3000`). All frontend requests MUST use relative paths (`/api/v1/...`).

### 1.2 Monorepo Tech Stack
Use an `npm workspaces` TypeScript monorepo:
```text
eshnav/
├── package.json                # Must include root "build", "start", "dev", "test", "typecheck", "db:seed" scripts
├── tsconfig.base.json
├── ARCHITECTURE.md
├── HANDOFF.md                  # Generated at the Phase 1 -> Phase 2 Stop Gate
├── packages/
│   ├── shared/                 # Zod schemas, DTOs, pastel palettes, time utilities, Hebrew UI copy
│   ├── server/                 # Fastify API, Drizzle ORM, better-sqlite3 (WAL), cron engine, Vitest suite
│   └── web/                    # Vite + React 19 + TypeScript + Tailwind CSS v4 (RTL) + Canvas Confetti
├── e2e/                        # Playwright E2E test suite
└── deploy/                     # systemd unit (eshnav.service) & Proxmox Debian 12 LXC install script
```

* **Database:** `better-sqlite3` with Drizzle ORM. Database file stored at configurable `DB_PATH` (default `./data/eshnav.db`, `/var/lib/eshnav/eshnav.db` in production).
  * Mandatory SQLite pragmas applied on every connection startup:
    ```sql
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    ```

---

## 2. Domain Model & Database Schema Specification

### 2.1 System Settings & Parental Lock (`app_settings` — Singleton Row `id = 1`)
There are no parent columns on the board and no child logins. The board is always open for viewing and task completion. Administrative actions (creating/editing tasks, toggling pool tasks, editing past history, changing settings) are protected by a **single global 4-digit Parental PIN (`🔒`)**.

* `id`: Integer PK (always `1`, enforced via `CHECK (id = 1)`)
* `appTitle`: Text, required, default `'הבית שלנו'`
* `parentPinHash`: Text, required (scrypt/salted hash of a 4-digit numeric PIN; default seeded to `'1234'`)
* `announcementEnabled`: Boolean, required, default `false` (1-tap toggle in Parent Zone to show/hide the banner)
* `announcementText`: Text, nullable
* `announcementEmoji`: Text, nullable, default `'📣'`
* `soundEnabled`: Boolean, required, default `true`
* `updatedAt`: Integer (Unix timestamp ms)

**Parent Admin Session Security:**
* Unlocking `🔒` (`POST /api/v1/admin/unlock`) verifies the 4-digit PIN and issues a signed HTTP-only cookie (`eshnav_admin_session`) or signed bearer token.
* In `NODE_ENV=production`, the server MUST require a non-empty `SESSION_SECRET` environment variable (`>= 32` chars) on startup and fail fast if missing.
* The frontend automatically relocks `🔒` after **5 minutes of inactivity** (or immediately when the parent taps `🔓` in the top bar).

### 2.2 Child Profiles (`profiles`)
Represents the color-coded child columns on the Skylight board.
* `id`: Integer PK autoincrement
* `name`: Text, required (supports Hebrew + Niqqud)
* `avatarEmoji`: Text, required (e.g., `'🦁'`, `'🦄'`, `'🦖'`, `'🦊'`, `'🐼'`, `'🚀'`, `'⚽'`, `'🎨'`)
* `avatarImageUrl`: Text, nullable (Future-ready field for custom avatar images; UI falls back to `avatarEmoji` when null)
* `pastelTheme`: Enum of **10 curated pastel themes**:
  * `'SKY'` (תכלת שמיים)
  * `'CORAL'` (אפרסק קורל)
  * `'MINT'` (מנטה רענן)
  * `'LAVENDER'` (לבנדר רך)
  * `'BUTTERCUP'` (צהוב חמאה)
  * `'ROSE'` (ורוד בייבי)
  * `'SAGE'` (ירוק מרווה)
  * `'PERIWINKLE'` (כחול לילך)
  * `'APRICOT'` (משמש חם)
  * `'AQUA'` (טורקיז לגונה)
* `sortOrder`: Integer, default `0`
* `isActive`: Boolean, default `true`
* `createdAt`: Integer (Unix timestamp ms)

### 2.3 Task Primitives (Strict Visual & Domain Simplicity)

`eshnav` has only **3 task primitives**:

#### Primitive 1: Daily Routines (`routine_templates` & `routine_daily_logs`)
Recurring daily habits assigned to a specific child profile (e.g., brushing teeth, getting dressed, organizing school bag).
* **Stars Rule:** Routines ALWAYS carry **0 stars**.
* **Israeli Week Schedule:** Days of the week stored as a JSON array of integers `[0..6]` where `0 = Sunday (יום א׳)` through `6 = Saturday (שבת)`.
* **Time Windows (`timeWindow`):**
  * `'MORNING'` (`☀️ בוקר` — `05:00–11:59`)
  * `'AFTERNOON'` (`🌤️ צהריים` — `12:00–16:59`)
  * `'EVENING'` (`🌙 ערב` — `17:00–23:59`)

**`routine_templates` Table:**
* `id`: Integer PK autoincrement
* `profileId`: Integer FK $\rightarrow$ `profiles.id` (Cascade delete)
* `title`: Text, required (supports Niqqud)
* `iconEmoji`: Text, required (e.g., `'🪥'`, `'🎒'`, `'🛏️'`)
* `timeWindow`: Enum `'MORNING' | 'AFTERNOON' | 'EVENING'`
* `daysOfWeekJson`: Text, required (JSON array of `[0..6]`, e.g., `"[0,1,2,3,4,5]"`)
* `sortOrder`: Integer, default `0`
* `isActive`: Boolean, default `true`
* `createdAt`: Integer (Unix timestamp ms)

**`routine_daily_logs` Table (Daily Tracking & Midnight Snapshot):**
* `id`: Integer PK autoincrement
* `routineId`: Integer FK $\rightarrow$ `routine_templates.id` (Set null or cascade)
* `profileId`: Integer FK $\rightarrow$ `profiles.id` (indexed)
* `titleSnapshot`: Text, required
* `iconEmojiSnapshot`: Text, required
* `timeWindowSnapshot`: Enum `'MORNING' | 'AFTERNOON' | 'EVENING'`
* `logicalDate`: Text, required (`YYYY-MM-DD` in `Asia/Jerusalem`, indexed)
* `status`: Enum `'COMPLETED' | 'MISSED'`
* `completedAt`: Integer, nullable (Unix timestamp ms)
* **Unique Constraint:** `(routineId, logicalDate)`

**Routine Progress Rings & Elapsed Window Red/Green Logic:**
For any child profile and any `logicalDate`:
* Each window (`MORNING`, `AFTERNOON`, `EVENING`) computes `{ totalScheduled, completedCount, redMissedCount, greyRemainingCount, isWindowElapsed }`:
  * On **Today (`logicalDate === today`)**:
    * `MORNING` is elapsed when current `Asia/Jerusalem` hour `>= 12`.
    * `AFTERNOON` is elapsed when current `Asia/Jerusalem` hour `>= 17`.
    * `EVENING` is not elapsed until midnight rollover (`00:00`).
    * If `isWindowElapsed === false`: Unfinished routines in that window count toward **`greyRemainingCount`** (ring shows **Green** for completed + **Soft Grey** for remaining).
    * If `isWindowElapsed === true`: Unfinished routines in that window count toward **`redMissedCount`** (ring shows **Green** for completed + **Red/Rose** for missed/overdue, alerting the child and parent immediately). Children can still tap an elapsed window ring today and complete overdue items until `00:00`.
  * On **Past Dates (`logicalDate < today` in History `📆`)**:
    * `isWindowElapsed` is always `true`. Every ring is strictly **Green** (`completedCount`) vs. **Red** (`redMissedCount`).

**Midnight (`00:00` `Asia/Jerusalem`) Rollover Engine:**
When the clock crosses `00:00` (and on server boot catch-up for any unsealed past dates):
1. Inside a synchronous `db.transaction`, for each active `routine_template` scheduled on `D_prev`'s day-of-week that lacks a row in `routine_daily_logs` for `D_prev`:
2. Insert a snapshot row with `status = 'MISSED'` using `.onConflictDoNothing()` so `runDailyRollover(date)` is 100% idempotent.

---

#### Primitive 2: Personal One-Off Chores (`personal_chores`)
Standalone chores assigned by a parent to a specific child (e.g., "Tidy room", "Put away laundry").
* **Rollover Rule:** Unfinished personal chores (`status === 'PENDING'`) remain on the child's board across midnight until completed or deleted by a parent.
* **Visibility Rule:** Always visible in the child's column below the active routine window (or when tapping the `🧹` Chores filter pill) so they are never hidden by time-of-day transitions.
* **Stars Rule:** Carries `0` to `N` stars (`stars >= 0`), set by a parent.

**`personal_chores` Table:**
* `id`: Integer PK autoincrement
* `profileId`: Integer FK $\rightarrow$ `profiles.id` (Cascade delete)
* `title`: Text, required (supports Niqqud)
* `iconEmoji`: Text, required
* `stars`: Integer, required, default `0` (`CHECK (stars >= 0)`)
* `status`: Enum `'PENDING' | 'COMPLETED'`
* `issuedDate`: Text, required (`YYYY-MM-DD` in `Asia/Jerusalem`)
* `completedDate`: Text, nullable (`YYYY-MM-DD` in `Asia/Jerusalem`)
* `completedAt`: Integer, nullable (Unix timestamp ms)
* `createdAt`: Integer (Unix timestamp ms)

---

#### Primitive 3: Shared Household Pool ("Up for Grabs" / `קופת המשימות`) (`pool_chores` & `pool_completions`)
Shared household chores (e.g., unloading the dishwasher, taking out recycling, sweeping the balcony) displayed in the eye-catching **Metallic Gold `קופת המשימות` Column**.
* **Zero "Claiming" Friction ("Did It!" Flow):** There is no "Claim / WIP" state. Any child who completes an available chore taps its check circle $\rightarrow$ selects their avatar in the **"מי אלוף הבית שביצע את זה?"** popover $\rightarrow$ immediately earns the stars and triggers the chore's reset behavior.

**`pool_chores` Table:**
* `id`: Integer PK autoincrement
* `title`: Text, required (supports Niqqud)
* `iconEmoji`: Text, required
* `stars`: Integer, required, default `1` (`CHECK (stars >= 0)`)
* `resetMode`: Enum `'COOLDOWN' | 'AUTO_DISABLE'`
  * `'COOLDOWN'` (`מחזורי עם השהיה`): After completion, sets `cooldownEndsAt = now + cooldownMinutes * 60_000`. While `now < cooldownEndsAt`, the chore is hidden from the active `קופת המשימות` list (or shown in Parent Admin as cooling down) and automatically reappears once `now >= cooldownEndsAt`.
  * `'AUTO_DISABLE'` (`הפעלה ידנית`): After completion, automatically sets `isActive = false`. Ideal for event-driven chores like "Unload the dishwasher" so it never reappears until a parent taps its 1-tap toggle switch in Parent Admin (`🔒`).
* `cooldownMinutes`: Integer, required, default `60` (`CHECK (cooldownMinutes > 0)`)
* `isActive`: Boolean, required, default `true`
* `cooldownEndsAt`: Integer, nullable (Unix timestamp ms)
* `lastCompletedAt`: Integer, nullable (Unix timestamp ms)
* `sortOrder`: Integer, default `0`
* `createdAt`: Integer (Unix timestamp ms)

**`pool_completions` Table (Completion Log for History & Undo):**
* `id`: Integer PK autoincrement
* `poolChoreId`: Integer FK $\rightarrow$ `pool_chores.id` (Set null on delete)
* `profileId`: Integer FK $\rightarrow$ `profiles.id` (Cascade delete, indexed)
* `titleSnapshot`: Text, required
* `iconEmojiSnapshot`: Text, required
* `starsAwarded`: Integer, required
* `logicalDate`: Text, required (`YYYY-MM-DD` in `Asia/Jerusalem`, indexed)
* `completedAt`: Integer, required (Unix timestamp ms)

---

### 2.4 Immutable Star Ledger (`star_transactions`)
All star balances are derived from `star_transactions`.

* `id`: Integer PK autoincrement
* `profileId`: Integer FK $\rightarrow$ `profiles.id` (Cascade delete, indexed)
* `sourceType`: Enum `'PERSONAL_CHORE' | 'POOL_CHORE' | 'UNDO' | 'PARENT_ADJUSTMENT'`
* `sourceId`: Integer, nullable (`personal_chores.id` or `pool_completions.id`)
* `starsDelta`: Integer, required (Positive when earning, negative when unchecking/undoing)
* `description`: Text, required
* `logicalDate`: Text, required (`YYYY-MM-DD` in `Asia/Jerusalem`, indexed)
* `createdAt`: Integer, required (Unix timestamp ms)

**1-Tap Uncheck / Undo (`ביטול סימון`) Atomic Transaction Rule:**
* On Today's board, completed items sit in a subtle collapsible `"הושלמו היום (X)"` drawer at the bottom of each child's column.
* Tapping the green checkmark `✅` on a completed item (whether a Routine, Personal Chore, or Pool Completion) executes a synchronous `db.transaction`:
  1. For a **Routine**: deletes today's `COMPLETED` row from `routine_daily_logs`.
  2. For a **Personal Chore**: sets `status = 'PENDING'`, `completedDate = null`, `completedAt = null`, and if `stars > 0`, inserts a compensating `-stars` row (`sourceType = 'UNDO'`) into `star_transactions`.
  3. For a **Pool Completion**: deletes the `pool_completions` row, inserts a compensating `-starsAwarded` row (`sourceType = 'UNDO'`) into `star_transactions`, and restores the parent `pool_chores` row (`cooldownEndsAt = null`, and if `resetMode === 'AUTO_DISABLE'`, restores `isActive = true`).

---

## 3. UI/UX Specification: The Skylight Visual System

### 3.1 Color System: 10 Kid Pastels + Metallic Gold `קופת המשימות`
Define a central theme map in `packages/shared/src/themes.ts` and corresponding CSS variables / Tailwind utilities:
1. **10 Child Pastel Palettes (`SKY`, `CORAL`, `MINT`, `LAVENDER`, `BUTTERCUP`, `ROSE`, `SAGE`, `PERIWINKLE`, `APRICOT`, `AQUA`):**
   * Each palette specifies: `columnBg` (ultra-soft pastel wash, e.g., `#F0F7FF`), `cardBg` (richer pastel pill surface, e.g., `#DCEEFF`), `cardCompletedBg` (muted pastel), `borderAccent`, `avatarRing`, and `textPrimary` (deep high-contrast slate/navy for effortless reading).
2. **`קופת המשימות` Metallic Gold / Shimmer Theme:**
   * Styled as an eye-catching **"Treasure / Bounty Column"**:
     * Column surface: Warm pearl-champagne gradient (`linear-gradient(145deg, #FFFDF5 0%, #FDF3C7 50%, #FDE68A 100%)`) with a metallic brushed-gold border (`#F59E0B` / `#D97706`) and subtle shimmer animation.
     * Task cards inside `קופת המשימות`: Crisp ivory-gold surface with a shiny metallic gold star badge (`✨ ⭐ +X`) that visually stands out as high-value bonus missions.

### 3.2 Typography, Niqqud & De-Cluttered Card Anatomy
* **Font Family:** Google Font **`Rubik`** (`subset=hebrew`, weights 400, 500, 700) with `line-height: 1.625` (`leading-relaxed`) so Hebrew **Niqqud** (vowel marks) renders cleanly without clipping.
* **Strict 3-Element Task Card Rule:**
  Every task card on the board MUST contain **ONLY**:
  1. **Large Emoji (`text-3xl`)** on the right (start).
  2. **Task Title (`text-lg font-medium`)** + optional **`⭐ X` pill** (if `stars > 0`).
  3. **Giant Check Circle (`w-11 h-11 rounded-full border-2 bg-white`)** on the left (end).
  * *Banned from task cards:* Issue dates, timestamps, status text labels, countdown clocks, or secondary action buttons (when `🔒` is locked).

### 3.3 Screen 1: The Main Skylight Family Board (`/`)

#### 1. Slim Top Bar
* **Right (Start):** Dynamic `appTitle` (default `הבית שלנו`) + live `Asia/Jerusalem` clock (`HH:mm`) and Hebrew day/date (`יום ראשון, 1 בנובמבר`).
* **Center (Mobile/Portrait Only):** Horizontal strip of big circular **Avatar Filter Pills**:
  * `[👨‍👩‍👧‍👦 כולם]` (side-by-side / stacked overview)
  * One circular **Avatar Pill per Child** (showing their giant `avatarEmoji` on their pastel color ring + subtle star badge—no cluttering text needed).
  * `[✨ קופת המשימות]` (Metallic Gold pill with a count badge of available pool chores).
* **Left (End):** Three clean icon buttons (`48px × 48px`):
  * **`🔊 / 🔇` Sound Toggle:** Toggles Web Audio API completion chimes.
  * **`📆` History View Button:** Opens the Daily History & Ring Overview screen (accessible without PIN!).
  * **`🔒 / 🔓` Parental Lock Button:** Locked (`🔒`) by default. Tapping `🔒` opens the 4-digit PIN keypad modal. When unlocked (`🔓`, highlighted in amber with a subtle countdown indicator), inline Parent controls appear across the board.

#### 2. Toggleable Family Announcement Banner
* Rendered directly below the top bar **ONLY IF** `app_settings.announcementEnabled === true` and `announcementText` is non-empty. When toggled off in Parent mode, it consumes `0px` of screen height.

#### 3. Child Columns (Side-by-Side Grid on Tablet/Desktop; Active Avatar Column on Phone)
Each child's pastel column contains:
1. **Minimal Avatar Header:**
   * Giant circular avatar badge (`avatarImageUrl` if present, otherwise `text-5xl` `avatarEmoji`) with a small subtle name label and a golden **`⭐ {totalStars}`** pill.
2. **The 3 Dual-Color SVG Progress Rings (`☀️`, `🌤️`, `🌙`):**
   * Positioned directly below the avatar header:
     * **☀️ (בוקר)** | **🌤️ (צהריים)** | **🌙 (ערב)**
   * Each icon sits inside an animated circular SVG ring (`stroke-dasharray`) showing **Green (`#10B981`)** for completed routines, **Soft Grey (`#E5E7EB`)** for remaining routines in an active/future window, and **Red/Rose (`#F43F5E`)** for unfinished routines in an **elapsed window**!
   * **Auto-Focus & Filtering:** By default, the column automatically selects the *current* time window (`☀️` in morning, `🌤️` in afternoon, `🌙` in evening) and hides routines from the other two windows. Tapping any ring (`☀️`, `🌤️`, or `🌙`) switches the visible routine list to that window (allowing a kid to see and complete a missed morning task if their `☀️` ring has red on it).
3. **Active Task List:**
   * Renders the selected window's uncompleted **Routines**, followed by any pending **Personal One-Off Chores** (`⭐` badge).
   * When all routines in the active window are completed (`completedCount === totalScheduled && totalScheduled > 0`), display a cheerful inline celebration card (`"🎉 כל הכבוד! סיימת את כל משימות ה{בוקר/צהריים/ערב}!"`) and burst confetti!
4. **Collapsible `"הושלמו היום (X)"` Drawer at Column Bottom:**
   * Shows today's completed items with soft strikethrough and a green `✅` circle. Tapping `✅` unchecks the item (and deducts stars if applicable).

#### 4. The Metallic Gold `קופת המשימות` Column ("Up for Grabs")
* Displays all active (`isActive === true`) and non-cooling-down (`cooldownEndsAt === null || now >= cooldownEndsAt`) `pool_chores`.
* **1-Tap "Did It!" Interaction:**
  * When a child taps the check circle `◯` on a `קופת המשימות` card, open a cheerful, centered popover modal:
    * Title: **`"מי אלוף הבית שביצע את המשימה?"`** (showing the chore's emoji, title, and `+X ⭐`).
    * Body: Giant, tappable pastel Avatar buttons for each active child profile.
  * Tapping a child's avatar immediately completes the chore for that child, plays the star-burst celebration + victory chime, awards `+X` stars to their ledger, places the completion into that child's `"הושלמו היום"` drawer, and transitions the pool chore into `COOLDOWN` or `AUTO_DISABLE`.

---

### 3.4 Screen 2: Daily History & Ring Audit View (`📆` — `/history`)
Designed so parents (and kids) can visually verify daily habit completion (e.g., proving whether teeth were brushed all week) without needing to enter the Parent PIN.

1. **Header & Date Stepper:**
   * `◀` (Previous Day) | **Formatted Hebrew Date (`יום שבת, 31 באוקטובר` / `אתמול` / `היום`)** + Calendar Date Picker | `▶` (Next Day, up to Today) + **`חזרה ללוח`** button.
2. **Per-Child Daily Overview & Drill-Down Cards:**
   * Displays each child's column for the selected `logicalDate`:
     * **Daily Star Summary:** `⭐ +{starsEarnedThatDay} כוכבים ביום זה` (and all-time balance).
     * **The 3 Green/Red Audit Rings (`☀️`, `🌤️`, `🌙`):** Shows the exact Green (Completed) vs. Red (Missed) ring ratio and fraction (`2/3`) for Morning, Afternoon, and Evening on that day.
     * **Detailed Drill-Down List:**
       * Clearly lists every scheduled routine and completed chore for that date:
         * **✅ בוצעו (Completed):** Green checkmark badge + completion time (`HH:mm`).
         * **❌ פוספסו / לא בוצעו (Missed Routines):** Highlighted with a clear **Red/Rose badge (`לא בוצע`)** and icon so missed habits (like brushing teeth) stand out immediately.
3. **Read-Only by Default / Editable When `🔓` Unlocked:**
   * When `🔒` is **Locked**: The History screen is strictly read-only (kids can browse their rings and history freely, but tapping tasks does nothing).
   * When `🔓` is **Unlocked (Parent Mode)**: Tapping any routine in the History drill-down toggles its status between `COMPLETED` and `MISSED` for that past date (`POST /api/v1/admin/history/toggle-routine`), allowing parents to give credit if a child genuinely did a routine yesterday and forgot to tap the board.

---

### 3.5 Screen 3: Parent Admin Zone (Unlocked via `🔒` $\rightarrow$ `🔓`)
When unlocked with the 4-digit Parent PIN, a clean **Admin Drawer / Modal (`ניהול הבית`)** and inline quick-actions become available:
1. **Instant `קופת המשימות` Switchboard:**
   * Top row of 1-tap toggle switches (`פעיל / כבוי`) for all `pool_chores` (so re-enabling "פינוי מדיח" after running the dishwasher takes 1 second), plus a button to clear an active cooldown immediately (`אפס השהיה`), and full CRUD for pool chores (`title`, `iconEmoji`, `stars`, `COOLDOWN` vs. `AUTO_DISABLE`, `cooldownMinutes`).
2. **Family Announcement Toggle & Editor:**
   * 1-tap switch (`הצג הודעה משפחתית בראש הלוח: פעיל / כבוי`) + emoji & text input.
3. **Manage Routines & Personal Chores:**
   * Add/edit/delete `routine_templates` (select child profile, emoji from built-in kid-friendly emoji grid, title with Niqqud support, time window `☀️/🌤️/🌙`, and Israeli days of week `א׳-ש׳`).
   * Add/delete `personal_chores` for any child (with star bounty `0..N`).
4. **Manage Child Profiles & Settings:**
   * Add/edit/reorder child profiles, pick from the **10 Pastel Themes**, choose `avatarEmoji` (or set optional `avatarImageUrl`), adjust a child's star balance manually (`PARENT_ADJUSTMENT`), edit `appTitle`, or change the 4-digit Parent PIN.

---

## 4. Implementation Milestones & Model Handover Plan

---

### PHASE 1: ARCHITECTURE, SCHEMA & CONTRACTS
> **Active Model:** `Claude Opus 5.5 (High)`
> **Active Skills:** `Superpowers`, `Ponytail`, `Caveman`, `database-architect`, `api-design-principles`, `typescript-pro`

#### Milestone 0: Monorepo Scaffold & Tooling Baseline
1. Initialize the root workspace (`package.json`, `tsconfig.base.json`, `.gitignore`, `.nvmrc` targeting Node 22 LTS).
2. Configure root `package.json` scripts so every command works directly from the repository root (`npm run dev`, `npm run build`, `npm start`, `npm test`, `npm run typecheck`, `npm run db:seed`).
3. Scaffold `packages/shared`, `packages/server`, and `packages/web` with strict TypeScript (`"strict": true`, `"noUncheckedIndexedAccess": true`).
4. **Verification Gate:** `npm install && npm run typecheck` passes with zero errors.

#### Milestone 1: Database Schema, Pastel/Gold Theme Tokens & Shared Zod Contracts
1. Using `database-architect`, implement `packages/server/src/db/schema.ts` with Drizzle ORM and `better-sqlite3`:
   * Tables: `app_settings`, `profiles`, `routine_templates`, `routine_daily_logs`, `personal_chores`, `pool_chores`, `pool_completions`, and `star_transactions`.
   * Enforce SQLite `CHECK` constraints (`app_settings.id = 1`, `stars >= 0`, `cooldownMinutes > 0`) and unique indexes (`(routineId, logicalDate)` on `routine_daily_logs`).
   * Implement `packages/server/src/db/connection.ts` applying `WAL`, `synchronous = NORMAL`, `foreign_keys = ON`, and `busy_timeout = 5000`. Ensure relative `DB_PATH` values resolve consistently against the monorepo root or explicit path.
2. Using `typescript-pro` and `api-design-principles`, implement `packages/shared/src/`:
   * `themes.ts`: All **10 Pastel Theme definitions** + the **Metallic Gold `קופת המשימות` theme** and a curated categorized **Kid Emoji Catalog** (`EMOJI_CATALOG` covering hygiene, school, room, kitchen, pets, sports, fun, and avatars).
   * `time.ts`: DST-safe `Asia/Jerusalem` date/time utilities using `Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23' })` and synthetic UTC noon anchors (`Date.UTC(y, m - 1, d, 12, 0, 0)`) for `shiftLogicalDate`, `getLogicalDateString`, `getIsraeliDayOfWeek`, `getCurrentTimeWindow`, and `isTimeWindowElapsed`.
   * `contracts.ts`: Complete Zod request/response schemas for `GET /api/v1/board`, routine/chore/pool completion & undo, `GET /api/v1/history`, and `/api/v1/admin/*` endpoints.
3. Document the architecture, transaction boundaries, and ring calculation rules in `ARCHITECTURE.md`.
4. **Verification Gate:** Write and pass unit tests in `packages/shared/test/time.test.ts` and `packages/server/test/schema.test.ts`.

---

## 🛑 STOP POINT 1 — MODEL HANDOVER GATE (`Opus 5.5` $\rightarrow$ `Argon 4`)

**CRITICAL INSTRUCTION FOR CLAUDE OPUS 5.5:**
1. Once **Milestone 0** and **Milestone 1** are complete and `npm test` + `npm run typecheck` pass:
2. Invoke the **`Matt Pocock Handoff Skill`** (`skill-handoff`) to generate `HANDOFF.md` in the repository root summarizing all created files, schema constraints, and exact starting instructions for **Milestone 2**.
3. **STOP IMMEDIATELY.** Do NOT start Milestone 2. Output a single short message telling the user:
   > *"Phase 1 (Architecture, Schema & Contracts) is complete and verified. `HANDOFF.md` has been written. Please switch your Antigravity model to **Gemini 4 Argon (High)** and reply `'Continue with Phase 2'`."*

---

### PHASE 2: TDD IMPLEMENTATION, SKYLIGHT RTL UI & E2E VERIFICATION
> **Active Model:** `Gemini 4 Argon (High)`
> **Active Skills:** `Superpowers`, `Ponytail`, `typescript-pro`, `api-design-principles`, `Frontend Design`, `Emil Kowalski Design Eng`, `e2e-testing-patterns`

#### Milestone 2: Core Domain Services, Ring Engine, 1-Tap Pool & Rollover (Strict TDD)
Follow strict **Red-Green-Refactor** in `packages/server/src/services/` with Vitest suites in `packages/server/test/services/`. All multi-table writes MUST execute inside synchronous `db.transaction((tx) => ...)` blocks:
1. **Board & Dual-Color Ring Calculation Service (`board.service.ts`):**
   * Test and implement `getFamilyBoard(now)`: returns `appSettings` (excluding PIN hash), each active child profile with `totalStars`, their 3 window ring states (`MORNING`, `AFTERNOON`, `EVENING` with `completedCount`, `redMissedCount`, `greyRemainingCount`, `isWindowElapsed`), their scheduled routines for today, pending `personal_chores`, today's completed items drawer, and active available `pool_chores`.
2. **Routine & Personal Chore Completion + 1-Tap Undo Service (`task.service.ts`):**
   * Test completing and unchecking a routine for today.
   * Test completing and unchecking a personal chore, verifying atomic `star_transactions` (`+N` on complete, `-N` with `sourceType: 'UNDO'` on uncheck).
3. **`קופת המשימות` ("Did It!") Service (`pool.service.ts`):**
   * Test `completePoolChore(poolChoreId, profileId, now)`:
     * Rejects if `isActive === false` or currently in cooldown (`now < cooldownEndsAt`).
     * Atomically writes `pool_completions`, inserts `+stars` into `star_transactions`, and updates `pool_chores`:
       * If `resetMode === 'COOLDOWN'`, sets `cooldownEndsAt = now + cooldownMinutes * 60_000`.
       * If `resetMode === 'AUTO_DISABLE'`, sets `isActive = false` and `cooldownEndsAt = null`.
   * Test `undoPoolCompletion(poolCompletionId, now)`:
     * Atomically deletes `pool_completions`, writes `-starsAwarded` (`sourceType: 'UNDO'`) to `star_transactions`, clears `cooldownEndsAt`, and if `resetMode === 'AUTO_DISABLE'`, restores `isActive = true`.
4. **Midnight Rollover & History Audit Service (`rollover.service.ts` & `history.service.ts`):**
   * Test idempotent `runDailyRollover(logicalDate)` writing `MISSED` snapshots to `routine_daily_logs` for uncompleted scheduled routines, plus boot-time catch-up for any missed past days.
   * Test `getDailyHistory(logicalDate)` returning each child's `starsEarnedThatDay`, their 3 Green/Red rings, and the complete drill-down of `COMPLETED` vs. `MISSED` routines and chores.
   * Test parent-only `togglePastRoutineStatus(routineId, logicalDate)` for correcting past days in History.
5. **Admin Auth & Settings Service (`admin.service.ts`):**
   * Test PIN verification, signed session token generation, PIN update, and fail-fast `SESSION_SECRET` validation in production mode.

#### Milestone 3: Fastify REST API & Family Seed (`packages/server`)
1. Build and integration-test the Fastify app (`packages/server/src/app.ts`):
   * Public Board & Kid Actions:
     * `GET /api/v1/board`
     * `POST /api/v1/routines/:id/toggle` (completes or unchecks for today)
     * `POST /api/v1/personal-chores/:id/toggle` (completes or unchecks for today)
     * `POST /api/v1/pool-chores/:id/complete` (body: `{ profileId }`)
     * `POST /api/v1/pool-completions/:id/undo`
     * `GET /api/v1/history?date=YYYY-MM-DD`
   * Parent Admin Endpoints (Protected by `requireParentAdmin` middleware):
     * `POST /api/v1/admin/unlock` & `POST /api/v1/admin/lock`
     * `PATCH /api/v1/admin/settings` (appTitle, announcementEnabled, announcementText, announcementEmoji, soundEnabled, newParentPin)
     * `CRUD /api/v1/admin/profiles` & `POST /api/v1/admin/profiles/:id/adjust-stars`
     * `CRUD /api/v1/admin/routines`
     * `CRUD /api/v1/admin/personal-chores`
     * `CRUD /api/v1/admin/pool-chores`, `PATCH /api/v1/admin/pool-chores/:id/toggle-active`, & `POST /api/v1/admin/pool-chores/:id/reset-cooldown`
     * `POST /api/v1/admin/history/toggle-routine`
2. Implement `packages/server/src/db/seed.ts` (`npm run db:seed`) with `appTitle = 'הבית שלנו'`, default PIN `1234`, 3 sample child profiles using distinct pastel themes (`SKY`, `CORAL`, `MINT`), sample morning/afternoon/evening routines with Niqqud, sample personal chores, and sample `קופת המשימות` chores (`פינוי מדיח` in `AUTO_DISABLE` mode and `סידור סלון` in `COOLDOWN` mode).

#### Milestone 4: Skylight RTL Frontend — Pastel Board, Dual-Color Rings & Metallic Gold Pool
Activate `Frontend Design` and `Emil Kowalski Design Engineering` to build `packages/web`:
1. **RTL, Typography & Web Audio Synthesizer:**
   * Configure `<html lang="he" dir="rtl">`, load Google Font **`Rubik`**, and implement a zero-dependency Web Audio API utility (`sound.ts`) that plays a gentle pop/chime on task check and a cheerful 3-note fanfare chord when a routine ring reaches 100%.
2. **Main Skylight Board (`/`):**
   * Top bar with `appTitle`, live clock/date, mobile Avatar Filter Pills (`כולם`, child avatars, `✨ קופת המשימות`), `🔊/🔇` button, `📆` History button, and `🔒/🔓` Parental Lock button (with 5-minute auto-relock timer).
   * Toggleable Family Announcement banner (hidden completely when `announcementEnabled === false`).
   * Responsive multi-column layout: side-by-side pastel child columns + Metallic Gold `קופת המשימות` column on tablet/desktop; instant 1-tap switching on mobile portrait.
   * **Dual-Color SVG Progress Rings (`☀️`, `🌤️`, `🌙`):** Smoothly animated SVG rings showing Green (done), Grey (remaining in active/future window), and Red/Rose (unfinished in an elapsed window).
   * **3-Element Task Cards:** Large emoji, Rubik title + `⭐` badge, and giant check circle `◯`.
   * **`קופת המשימות` "Who Did It?" Modal:** Tapping `◯` on a golden pool chore opens `"מי אלוף הבית שביצע את המשימה?"` with giant tappable child avatars, triggering confetti + star animation on selection.
   * Auto-refresh board state every 15 seconds and on window `visibilitychange`.

#### Milestone 5: History Audit Screen (`📆`) & Inline Parent Admin (`🔓`)
1. **`📆` History Screen (`/history`):**
   * Accessible openly without PIN (read-only when `🔒` is locked).
   * Date stepper (`◀` / `▶` / `"חזרה להיום"`) + per-child columns showing daily stars earned, the 3 Green/Red audit rings (`☀️`, `🌤️`, `🌙`), and the full drill-down list clearly highlighting `✅ בוצע` vs. `❌ לא בוצע` (Red badge on missed routines).
   * When `🔓` is unlocked, parents can tap any past routine row in History to toggle `COMPLETED` $\leftrightarrow$ `MISSED`.
2. **Parent Admin Drawer (`ניהול הבית` when `🔓` is unlocked):**
   * **1-Tap `קופת המשימות` Switchboard** (`פעיל / כבוי` toggles + cooldown reset + create/edit modal).
   * **1-Tap Family Announcement Toggle** (`פעיל / כבוי`) + text/emoji editor.
   * Full management tabs for Child Profiles (with 10 Pastel Theme swatches + Emoji Picker), Routines (Sun–Sat day pills + `☀️/🌤️/🌙` selector), and Personal Chores.

#### Milestone 6: Playwright E2E Verification & Proxmox LXC Packaging
Activate `e2e-testing-patterns`:
1. Write comprehensive Playwright E2E tests (`e2e/`):
   * **Flow 1 (Zero-Login Skylight Board & RTL):** Verify `dir="rtl"`, zero banned physical directional classes, child pastel columns, and 1-tap routine completion + 1-tap uncheck from `"הושלמו היום"`.
   * **Flow 2 (Dual-Color Progress Rings):** Verify active vs. elapsed time window ring rendering (Green/Grey vs. Green/Red).
   * **Flow 3 (`קופת המשימות` 1-Tap "Did It!" & Undo):** Tap a golden pool chore $\rightarrow$ select a child avatar in the popover $\rightarrow$ verify stars increase and `AUTO_DISABLE` chore disappears from the active pool $\rightarrow$ uncheck it in `"הושלמו היום"` $\rightarrow$ verify stars are deducted and the chore returns to `קופת המשימות`.
   * **Flow 4 (`📆` History Screen Read-Only vs. Parent Edit):** Open `📆` without PIN, inspect missed routines (`לא בוצע`), verify read-only protection when locked, then unlock `🔒` with PIN `1234` and toggle a past missed routine to completed.
   * **Flow 5 (Parent Admin Switchboard & Banner Toggle):** Unlock `🔒`, toggle the Family Announcement banner on/off, toggle an `AUTO_DISABLE` pool chore back to active, and verify immediate board update.
2. Create `deploy/eshnav.service` and `deploy/install-lxc.sh` (automatically generating `/etc/eshnav/eshnav.env` with a strong 64-char hex `SESSION_SECRET`, `TZ=Asia/Jerusalem`, `NODE_ENV=production`, `PORT=3000`, `DB_PATH=/var/lib/eshnav/eshnav.db`).

---

## 🛑 STOP POINT 2 — PRE-AUDIT HANDOVER GATE (`Argon 4` $\rightarrow$ `Opus/Sonnet 5.5 Judge`)

**CRITICAL INSTRUCTION FOR GEMINI 4 ARGON:**
Once Milestone 6 is complete and `npm run typecheck`, `npm test`, `npm run build`, and `npx playwright test` all pass:
1. Invoke the **`Matt Pocock Handoff Skill`** to update `HANDOFF.md` with a concise final manifest (file tree summary, test count, and architectural summary).
2. Stage and commit the clean state (`git add -A && git commit -m "feat: complete eshnav Phase 2 implementation"`).
3. **STOP IMMEDIATELY** and prompt the user to start a fresh thread for the Phase 3 Cross-Model Judge pass.