# HANDOFF — Phase 2 → Phase 3 (Cross-Model Judge Audit)

**From:** Gemini 4 Argon (Phase 2: TDD Implementation, Skylight RTL UI & E2E Verification)
**To:** Claude Opus / Sonnet 5.5 (Phase 3: Cross-Model Judge Pass)
**Date:** 2026-11-01
**State:** Milestones 0–6 complete, verified, and committed (`feat: complete eshnav Phase 2 implementation`).

- Product specification: [SPEC.md](SPEC.md)
- System architecture, schema constraints, transaction boundaries & API contracts: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 1. Verification Evidence Summary

| Gate Command (Repo Root) | Status | Result |
| :--- | :--- | :--- |
| `npm run typecheck` | PASS | 0 errors across `@eshnav/shared`, `@eshnav/server`, `@eshnav/web`, and `e2e` (`strict: true`, `noUncheckedIndexedAccess: true`) |
| `npm test` | PASS | **89 Vitest unit & integration tests passing** across 10 suites (`46` in `@eshnav/shared`, `43` in `@eshnav/server`) |
| `npm run build` | PASS | Clean production build (`shared` → `server` → `web` Vite bundle) |
| `npm run db:seed` | PASS | Idempotent family seed (`הבית שלנו`, PIN `1234`, 3 pastel profiles, Niqqud routines, personal chores, golden pool chores) |
| `npx playwright test` | PASS | **5 / 5 Playwright E2E flows passing** against single-origin Fastify + compiled Vite SPA + SQLite WAL (**94 total automated tests**) |

---

## 2. Final Repository File Tree

```text
eshnav/
├── package.json                    # Workspaces + dev, build, start, test, test:e2e, typecheck, db:seed
├── tsconfig.base.json              # Strict TS 7.0 base config
├── playwright.config.ts            # he-IL / Asia/Jerusalem Playwright config
├── ARCHITECTURE.md                 # Data model, transactions, ring engine & REST contracts
├── HANDOFF.md                      # Phase 2 -> Phase 3 Judge manifest
├── deploy/
│   ├── eshnav.service              # Hardened systemd unit (<120 MB RAM cap, Asia/Jerusalem)
│   └── install-lxc.sh              # Idempotent Proxmox Debian 12 LXC installer (64-char hex SESSION_SECRET)
├── e2e/
│   ├── tsconfig.json
│   └── eshnav.spec.ts              # 5 end-to-end flows (RTL class audit, dual-color rings, pool, history, admin)
└── packages/
    ├── shared/
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── time.ts             # Asia/Jerusalem Intl + UTC-noon DST-safe calendar helpers
    │   │   ├── themes.ts           # 10 kid pastel palettes, Metallic Gold pool theme, RING_COLORS, EMOJI_CATALOG
    │   │   └── contracts.ts        # Strict Zod request/response schemas & DTO types
    │   └── test/
    │       ├── time.test.ts        # 36 DST & boundary tests
    │       └── contracts.test.ts   # 10 contract validation tests
    ├── server/
    │   ├── drizzle.config.ts
    │   ├── drizzle/                # Generated SQLite migration SQL & metadata
    │   ├── src/
    │   │   ├── index.ts            # Fastify bootstrap, SESSION_SECRET guard, boot catch-up & 30s midnight watcher
    │   │   ├── app.ts              # Single-origin Fastify API (/api/v1/*) + SPA static fallback (zero raw DB queries)
    │   │   ├── db/
    │   │   │   ├── schema.ts       # 8 Drizzle SQLite tables with CHECKs, FKs & composite indexes
    │   │   │   ├── connection.ts   # WAL, NORMAL, foreign_keys=ON, busy_timeout=5000 + auto-migrate
    │   │   │   ├── seed-data.ts    # Idempotent family seed logic
    │   │   │   └── seed.ts         # CLI entrypoint for npm run db:seed
    │   │   └── services/
    │   │       ├── errors.ts       # Typed DomainError -> HTTP status mapping
    │   │       ├── admin.service.ts    # scrypt PIN hash/verify, HMAC session token, PinRateLimiter, settings & CRUD
    │   │       ├── task.service.ts     # Atomic routine & personal chore toggle + UNDO star ledger compensation
    │   │       ├── pool.service.ts     # Atomic קופת המשימות completion (COOLDOWN / AUTO_DISABLE) & 1-tap undo
    │   │       ├── rollover.service.ts # Idempotent runDailyRollover & multi-day runCatchUpRollover
    │   │       ├── history.service.ts  # Daily Green/Red ring audit, drill-down & parent past-routine toggle
    │   │       └── board.service.ts    # Skylight board aggregator & dual-color elapsed/active ring calculator
    │   └── test/
    │       ├── schema.test.ts
    │       ├── api.test.ts
    │       └── services/*.test.ts  # Full TDD service suites (admin, task, pool, rollover, history, board)
    └── web/
        ├── index.html              # <html lang="he" dir="rtl">, Rubik Hebrew font, mobile-native viewport
        ├── vite.config.ts
        └── src/
            ├── index.css           # Logical RTL styles, custom easings, gold shimmer, reduced-motion, touch rules
            ├── main.tsx
            ├── App.tsx             # Skylight board, 15s + visibility refresh, 5-min parent auto-relock
            ├── lib/
            │   ├── api.ts          # Typed relative /api/v1/* fetch client
            │   ├── hebrewDate.ts   # Asia/Jerusalem live clock & Hebrew date formatters
            │   ├── sound.ts        # Zero-dep Web Audio API chimes & 3-note fanfare chord
            │   └── celebrate.ts    # Reduced-motion-safe canvas-confetti bursts
            └── components/
                ├── DualColorRing.tsx   # Animated Green/Grey vs Green/Red SVG progress rings
                ├── TaskCard.tsx        # Strict 3-element Skylight task card (emoji, title + optional ⭐, check circle)
                ├── ChildColumn.tsx     # Pastel child column, window ring switcher & "הושלמו היום (X)" drawer
                ├── PoolColumn.tsx      # Metallic Gold קופת המשימות bounty column
                ├── WhoDidItModal.tsx   # "מי אלוף הבית שביצע את המשימה?" child avatar picker
                ├── PinModal.tsx        # 4-digit numeric keypad modal
                ├── HistoryView.tsx     # Open read-only /history audit screen + unlocked parent 1-tap toggle
                ├── AdminDrawer.tsx     # ניהול הבית switchboard, banner toggle, routines/chores/profiles CRUD
                └── EmojiPicker.tsx     # Categorized kid emoji picker
```

---

## 3. Architectural Decisions & Audit Notes

1. **Zero Business Logic in Transport or UI:** `packages/server/src/app.ts` performs only Zod boundary parsing, cookie handling, and delegation to synchronous `db.transaction((tx) => ...)` services in `packages/server/src/services/`.
2. **Strict Native RTL:** Verified via both static grep across `packages/web` and runtime DOM class inspection in Playwright Flow 1 — zero banned physical horizontal classes exist.
3. **Top-Bar Sound Toggle (`🔊/🔇`) Resolution:** Works in 1 tap on the open board via local device override (`localStorage`, defaulting to `settings.soundEnabled`), and also persists `soundEnabled` to `/api/v1/admin/settings` whenever Parent Mode (`🔓`) is unlocked.
4. **LAN + Cloudflare Tunnel Cookie Compatibility:** `eshnav_admin_session` sets `HttpOnly; SameSite=Lax; Path=/` and dynamically enables `Secure` when `req.protocol === 'https'` or `X-Forwarded-Proto: https`, so Parent Mode works both over local Proxmox LAN HTTP (`http://192.168.x.x:3000`) and Cloudflare Tunnel HTTPS.

---

## 4. Suggested Skills for the Phase 3 Judge Agent

Invoke the following skills at the start of Phase 3:
- `using-superpowers`
- `ponytail-review` and `ponytail-audit` (whole-repo logic, security, data-safety, and YAGNI audit)
- `verification-before-completion` (re-run `npm run typecheck`, `npm test`, `npm run build`, and `npx playwright test` before signing off)
