import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PASTEL_PALETTES,
  type BoardPoolChore,
  type BoardResponse,
  type CompletedItem,
  type TimeWindow,
} from '@eshnav/shared';
import { AdminDrawer, type AdminTab } from './components/AdminDrawer.js';
import { ChildColumn } from './components/ChildColumn.js';
import { HistoryView } from './components/HistoryView.js';
import { PinModal } from './components/PinModal.js';
import { PoolColumn } from './components/PoolColumn.js';
import { WhoDidItModal } from './components/WhoDidItModal.js';
import { api } from './lib/api.js';
import { burstGoldStars, burstWindowCelebration } from './lib/celebrate.js';
import { formatJerusalemClock, formatJerusalemTopDate } from './lib/hebrewDate.js';
import { playCheckChime, playFanfareChord, playUndoTick } from './lib/sound.js';

type RoutePath = '/' | '/history';
type MobileFilter = 'ALL' | 'POOL' | number;

const PARENT_AUTO_RELOCK_MS = 5 * 60_000; // 5 minutes
const SOUND_STORAGE_KEY = 'eshnav_sound_override';

function resolveRoute(): RoutePath {
  return window.location.pathname === '/history' ? '/history' : '/';
}

export function App() {
  const [route, setRoute] = useState<RoutePath>(() => resolveRoute());
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Live clock
  const [clockNow, setClockNow] = useState<number>(() => Date.now());

  // Mobile avatar filter ('ALL' | child.id | 'POOL')
  const [mobileFilter, setMobileFilter] = useState<MobileFilter>('ALL');

  // Sound state (local override or server default)
  const [soundOverride, setSoundOverride] = useState<boolean | null>(() => {
    try {
      const saved = window.localStorage.getItem(SOUND_STORAGE_KEY);
      return saved === 'true' ? true : saved === 'false' ? false : null;
    } catch {
      return null;
    }
  });

  // Pool "Who Did It?" modal
  const [activePoolChore, setActivePoolChore] = useState<BoardPoolChore | null>(null);
  const [poolSubmitting, setPoolSubmitting] = useState(false);

  // Parent Lock & 5-minute inactivity countdown
  const [isParentUnlocked, setIsParentUnlocked] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [openAdminAfterUnlock, setOpenAdminAfterUnlock] = useState(false);
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const [adminInitialTab, setAdminInitialTab] = useState<AdminTab>('pool');
  const [adminInitialProfileId, setAdminInitialProfileId] = useState<number | undefined>(undefined);
  const [relockRemainingSec, setRelockRemainingSec] = useState<number>(300);
  const lastActivityRef = useRef<number>(Date.now());

  const soundEnabled = soundOverride ?? board?.settings.soundEnabled ?? true;

  const navigate = useCallback((next: RoutePath) => {
    if (window.location.pathname !== next) {
      window.history.pushState({}, '', next);
    }
    setRoute(next);
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(resolveRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const refreshBoard = useCallback(async () => {
    try {
      const next = await api.getBoard();
      setBoard(next);
      setLoadError(null);
      document.title = next.settings.appTitle;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'שגיאה בטעינת הלוח');
    }
  }, []);

  // Initial load + admin session check
  useEffect(() => {
    void refreshBoard();
    void api
      .getAdminSession()
      .then((res) => {
        if (res.unlocked) {
          lastActivityRef.current = Date.now();
          setIsParentUnlocked(true);
        }
      })
      .catch(() => {});
  }, [refreshBoard]);

  // 15-second auto-refresh + visibilitychange refresh + live clock tick
  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockNow(Date.now());
      if (document.visibilityState === 'visible') {
        void refreshBoard();
      }
    }, 15_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        setClockNow(Date.now());
        void refreshBoard();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshBoard]);

  const handleLockParent = useCallback(async () => {
    setIsParentUnlocked(false);
    setAdminDrawerOpen(false);
    try {
      await api.lockAdmin();
    } catch {
      // Ignore network errors when locking locally
    }
  }, []);

  // 5-minute inactivity auto-relock timer while unlocked
  useEffect(() => {
    if (!isParentUnlocked) return;
    lastActivityRef.current = Date.now();
    setRelockRemainingSec(Math.ceil(PARENT_AUTO_RELOCK_MS / 1000));

    const bumpActivity = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', bumpActivity, { passive: true });
    window.addEventListener('keydown', bumpActivity);

    const ticker = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= PARENT_AUTO_RELOCK_MS) {
        void handleLockParent();
      } else {
        setRelockRemainingSec(Math.max(1, Math.ceil((PARENT_AUTO_RELOCK_MS - elapsed) / 1000)));
      }
    }, 1_000);

    return () => {
      window.removeEventListener('pointerdown', bumpActivity);
      window.removeEventListener('keydown', bumpActivity);
      window.clearInterval(ticker);
    };
  }, [isParentUnlocked, handleLockParent]);

  const handleUnlockParent = async (pin: string) => {
    await api.unlockAdmin(pin);
    lastActivityRef.current = Date.now();
    setIsParentUnlocked(true);
    setPinModalOpen(false);
    if (openAdminAfterUnlock && route === '/') {
      setAdminInitialTab('pool');
      setAdminInitialProfileId(undefined);
      setAdminDrawerOpen(true);
    }
    setOpenAdminAfterUnlock(false);
  };

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundOverride(next);
    try {
      window.localStorage.setItem(SOUND_STORAGE_KEY, String(next));
    } catch {
      // Ignore storage restriction
    }
    if (isParentUnlocked) {
      void api.updateSettings({ soundEnabled: next }).then(() => refreshBoard()).catch(() => {});
    }
  };

  // ─── Kid Board Interactions ────────────────────────────────────────────────

  const handleToggleRoutine = async (profileId: number, routineId: number, window: TimeWindow) => {
    const key = `routine-${routineId}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      const prevRing = board?.profiles.find((p) => p.id === profileId)?.rings[window];
      const res = await api.toggleRoutine(routineId);
      await refreshBoard();
      if (res.isCompleted) {
        const finishesWindow =
          prevRing !== undefined &&
          prevRing.totalScheduled > 0 &&
          prevRing.completedCount + 1 === prevRing.totalScheduled;
        if (finishesWindow) {
          playFanfareChord(soundEnabled);
          burstWindowCelebration();
        } else {
          playCheckChime(soundEnabled);
        }
      } else {
        playUndoTick(soundEnabled);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleTogglePersonalChore = async (choreId: number) => {
    const key = `chore-${choreId}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      const res = await api.togglePersonalChore(choreId);
      await refreshBoard();
      if (res.status === 'COMPLETED') {
        playCheckChime(soundEnabled);
      } else {
        playUndoTick(soundEnabled);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleUndoCompletedItem = async (item: CompletedItem) => {
    const key = `undo-${item.kind}-${item.id}`;
    if (busyKey) return;
    setBusyKey(key);
    try {
      if (item.kind === 'ROUTINE') {
        await api.toggleRoutine(item.id);
      } else if (item.kind === 'PERSONAL_CHORE') {
        await api.togglePersonalChore(item.id);
      } else {
        await api.undoPoolCompletion(item.id);
      }
      await refreshBoard();
      playUndoTick(soundEnabled);
    } finally {
      setBusyKey(null);
    }
  };

  const handleCompletePoolChore = async (profileId: number) => {
    if (!activePoolChore || poolSubmitting) return;
    setPoolSubmitting(true);
    try {
      await api.completePoolChore(activePoolChore.id, profileId);
      setActivePoolChore(null);
      await refreshBoard();
      playFanfareChord(soundEnabled);
      burstGoldStars();
    } finally {
      setPoolSubmitting(false);
    }
  };

  const formatCountdown = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (route === '/history') {
    return (
      <>
        <HistoryView
          todayLogicalDate={board?.logicalDate ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(clockNow)}
          isParentUnlocked={isParentUnlocked}
          onBackToBoard={() => {
            navigate('/');
            void refreshBoard();
          }}
          onRequestUnlock={() => {
            setOpenAdminAfterUnlock(false);
            setPinModalOpen(true);
          }}
          onLockParent={() => void handleLockParent()}
        />
        <PinModal
          open={pinModalOpen}
          onUnlock={handleUnlockParent}
          onClose={() => setPinModalOpen(false)}
        />
      </>
    );
  }

  const showAnnouncement =
    board !== null &&
    board.settings.announcementEnabled &&
    Boolean(board.settings.announcementText?.trim());

  const desktopColsCount = (board?.profiles.length ?? 0) + 1;

  return (
    <div data-testid="skylight-board" className="mx-auto flex min-h-dvh max-w-[1600px] flex-col px-3 py-3 sm:px-5 sm:py-4">
      {/* 1. Slim Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-xs">
        {/* Start (Right): Dynamic appTitle + live Asia/Jerusalem clock & Hebrew date */}
        <div className="flex items-center gap-3">
          <h1
            data-testid="app-title"
            className="text-xl font-bold text-slate-900 sm:text-2xl leading-relaxed"
          >
            {board?.settings.appTitle ?? 'הבית שלנו'}
          </h1>
          <div className="flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
            <span data-testid="live-clock" className="font-bold text-slate-900 tabular-nums">
              {formatJerusalemClock(clockNow)}
            </span>
            <span aria-hidden="true" className="text-slate-300">
              |
            </span>
            <span className="hidden sm:inline">{formatJerusalemTopDate(clockNow)}</span>
          </div>
        </div>

        {/* End (Left): Admin shortcut (when unlocked) + 3 clean 48x48 icon buttons */}
        <div className="flex items-center gap-2">
          {isParentUnlocked && (
            <button
              type="button"
              data-testid="open-admin-drawer-btn"
              onClick={() => {
                setAdminInitialTab('pool');
                setAdminInitialProfileId(undefined);
                setAdminDrawerOpen(true);
              }}
              className="pressable inline-flex h-12 items-center gap-1.5 rounded-2xl bg-amber-100 px-3.5 text-sm font-bold text-amber-950 ring-1 ring-amber-400 cursor-pointer hover:bg-amber-200"
            >
              <span>⚙️ ניהול הבית</span>
            </button>
          )}

          {/* 🔊 / 🔇 Sound Toggle */}
          <button
            type="button"
            data-testid="sound-toggle-btn"
            aria-label={soundEnabled ? 'השתקת צלילים' : 'הפעלת צלילים'}
            aria-pressed={soundEnabled}
            onClick={handleToggleSound}
            className="pressable flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-800 cursor-pointer hover:bg-slate-200"
          >
            {soundEnabled ? '🔊' : '🔇'}
          </button>

          {/* 📆 History View Button (Open without PIN) */}
          <button
            type="button"
            data-testid="history-nav-btn"
            aria-label="היסטוריה יומית וטבעות"
            onClick={() => navigate('/history')}
            className="pressable flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-xl text-slate-800 cursor-pointer hover:bg-slate-200"
          >
            📆
          </button>

          {/* 🔒 / 🔓 Parental Lock Button */}
          <button
            type="button"
            data-testid="parent-lock-btn"
            aria-label={isParentUnlocked ? 'נעילת מצב הורים' : 'פתיחת מצב הורים'}
            onClick={() => {
              if (isParentUnlocked) {
                void handleLockParent();
              } else {
                setOpenAdminAfterUnlock(true);
                setPinModalOpen(true);
              }
            }}
            className={[
              'pressable flex h-12 min-w-12 items-center justify-center gap-1.5 rounded-2xl px-3 text-xl cursor-pointer',
              isParentUnlocked
                ? 'bg-amber-400 text-amber-950 shadow-xs ring-2 ring-amber-500'
                : 'bg-slate-100 text-slate-800 hover:bg-slate-200',
            ].join(' ')}
          >
            <span>{isParentUnlocked ? '🔓' : '🔒'}</span>
            {isParentUnlocked && (
              <span className="text-xs font-bold tabular-nums">{formatCountdown(relockRemainingSec)}</span>
            )}
          </button>
        </div>

        {/* Center Strip (Mobile/Portrait Only): Circular Avatar Filter Pills */}
        {board && (
          <nav
            aria-label="סינון תצוגת לוח"
            className="flex w-full items-center gap-2 overflow-x-auto pt-1 lg:hidden"
          >
            <button
              type="button"
              data-testid="filter-pill-all"
              onClick={() => setMobileFilter('ALL')}
              className={[
                'pressable inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold cursor-pointer',
                mobileFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700',
              ].join(' ')}
            >
              <span>👨‍👩‍👧‍👦</span>
              <span>כולם</span>
            </button>

            {board.profiles.map((child) => {
              const palette = PASTEL_PALETTES[child.pastelTheme];
              const active = mobileFilter === child.id;
              return (
                <button
                  key={child.id}
                  type="button"
                  data-testid={`filter-pill-child-${child.id}`}
                  aria-label={child.name}
                  onClick={() => setMobileFilter(child.id)}
                  style={{
                    backgroundColor: palette.cardBg,
                    borderColor: active ? palette.textPrimary : palette.avatarRing,
                  }}
                  className="pressable relative flex h-11 shrink-0 items-center gap-1.5 rounded-full border-2 px-3 cursor-pointer"
                >
                  <span className="text-2xl leading-none">{child.avatarEmoji}</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: palette.textPrimary }}>
                    ⭐{child.totalStars}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              data-testid="filter-pill-pool"
              onClick={() => setMobileFilter('POOL')}
              className={[
                'pressable gold-star-badge inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold cursor-pointer',
                mobileFilter === 'POOL' ? 'ring-2 ring-slate-900' : '',
              ].join(' ')}
            >
              <span>✨ קופת המשימות</span>
              <span className="rounded-full bg-white/85 px-2 py-0.5 text-xs tabular-nums">
                {board.poolChores.length}
              </span>
            </button>
          </nav>
        )}
      </header>

      {/* 2. Toggleable Family Announcement Banner (0px when disabled or empty) */}
      {showAnnouncement && board && (
        <aside
          data-testid="family-announcement-banner"
          className="mt-3 flex items-center justify-center gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-center shadow-2xs"
        >
          <span className="text-2xl leading-none" aria-hidden="true">
            {board.settings.announcementEmoji || '📣'}
          </span>
          <p className="text-base font-bold text-sky-950 leading-relaxed">
            {board.settings.announcementText}
          </p>
        </aside>
      )}

      {loadError && !board && (
        <div role="alert" className="mt-6 rounded-2xl bg-rose-50 p-4 text-center text-base font-medium text-rose-800">
          {loadError}
        </div>
      )}

      {/* 3 & 4. Child Pastel Columns + Metallic Gold קופת המשימות Column */}
      {!board ? (
        <div className="flex flex-1 items-center justify-center py-20 text-lg font-medium text-slate-500">
          טוען את הלוח המשפחתי...
        </div>
      ) : (
        <main
          style={
            {
              '--board-cols': Math.min(5, Math.max(2, desktopColsCount)),
            } as React.CSSProperties
          }
          className="mt-3 grid flex-1 grid-cols-1 gap-3.5 lg:grid-cols-[repeat(var(--board-cols),minmax(0,1fr))]"
        >
          {board.profiles.map((profile) => {
            const hiddenOnMobile = mobileFilter !== 'ALL' && mobileFilter !== profile.id;
            return (
              <div key={profile.id} className={hiddenOnMobile ? 'hidden lg:flex lg:flex-col' : 'flex flex-col'}>
                <ChildColumn
                  profile={profile}
                  currentWindow={board.currentWindow}
                  isParentUnlocked={isParentUnlocked}
                  busyKey={busyKey}
                  onToggleRoutine={(routineId, window) =>
                    void handleToggleRoutine(profile.id, routineId, window)
                  }
                  onTogglePersonalChore={(choreId) => void handleTogglePersonalChore(choreId)}
                  onUndoCompletedItem={(item) => void handleUndoCompletedItem(item)}
                  onOpenAdminForChild={(childId) => {
                    setAdminInitialTab('tasks');
                    setAdminInitialProfileId(childId);
                    setAdminDrawerOpen(true);
                  }}
                />
              </div>
            );
          })}

          <div
            className={
              mobileFilter !== 'ALL' && mobileFilter !== 'POOL'
                ? 'hidden lg:flex lg:flex-col'
                : 'flex flex-col'
            }
          >
            <PoolColumn
              poolChores={board.poolChores}
              isParentUnlocked={isParentUnlocked}
              onSelectChoreToComplete={(chore) => setActivePoolChore(chore)}
              onOpenPoolSwitchboard={() => {
                setAdminInitialTab('pool');
                setAdminInitialProfileId(undefined);
                setAdminDrawerOpen(true);
              }}
            />
          </div>
        </main>
      )}

      {/* "Who Did It?" Pool Completion Modal */}
      <WhoDidItModal
        chore={activePoolChore}
        profiles={board?.profiles ?? []}
        busy={poolSubmitting}
        onSelectChild={(profileId) => void handleCompletePoolChore(profileId)}
        onClose={() => setActivePoolChore(null)}
      />

      {/* Parent PIN Unlock Modal */}
      <PinModal
        open={pinModalOpen}
        onUnlock={handleUnlockParent}
        onClose={() => setPinModalOpen(false)}
      />

      {/* Parent Admin Drawer (ניהול הבית) */}
      {board && (
        <AdminDrawer
          open={adminDrawerOpen && isParentUnlocked}
          initialTab={adminInitialTab}
          initialProfileId={adminInitialProfileId}
          settings={board.settings}
          onClose={() => setAdminDrawerOpen(false)}
          onMutated={refreshBoard}
        />
      )}
    </div>
  );
}
