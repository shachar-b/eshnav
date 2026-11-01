import { useEffect, useState } from 'react';
import {
  PASTEL_PALETTES,
  TIME_WINDOWS,
  TIME_WINDOW_META,
  type BoardProfile,
  type CompletedItem,
  type TimeWindow,
} from '@eshnav/shared';
import { DualColorRing } from './DualColorRing.js';
import { TaskCard } from './TaskCard.js';

interface ChildColumnProps {
  profile: BoardProfile;
  currentWindow: TimeWindow;
  isParentUnlocked: boolean;
  busyKey: string | null;
  onToggleRoutine: (routineId: number, window: TimeWindow) => void;
  onTogglePersonalChore: (choreId: number) => void;
  onUndoCompletedItem: (item: CompletedItem) => void;
  onOpenAdminForChild?: (profileId: number) => void;
}

export function ChildColumn({
  profile,
  currentWindow,
  isParentUnlocked,
  busyKey,
  onToggleRoutine,
  onTogglePersonalChore,
  onUndoCompletedItem,
  onOpenAdminForChild,
}: ChildColumnProps) {
  const palette = PASTEL_PALETTES[profile.pastelTheme];
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>(currentWindow);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync selected window automatically when server's active time-of-day window changes
  useEffect(() => {
    setSelectedWindow(currentWindow);
  }, [currentWindow]);

  const activeWindowRing = profile.rings[selectedWindow];
  const visibleRoutines = profile.pendingRoutines.filter((r) => r.timeWindow === selectedWindow);
  const isWindowAllDone =
    activeWindowRing.totalScheduled > 0 &&
    activeWindowRing.completedCount === activeWindowRing.totalScheduled;
  const windowLabelHe = TIME_WINDOW_META[selectedWindow].labelHe;

  return (
    <section
      data-testid={`child-column-${profile.id}`}
      data-pastel-theme={profile.pastelTheme}
      style={{
        backgroundColor: palette.columnBg,
        borderColor: palette.borderAccent,
      }}
      className="flex flex-col rounded-3xl border-2 p-4 shadow-xs"
    >
      {/* 1. Minimal Avatar Header */}
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="flex items-center gap-3">
          <div
            style={{ borderColor: palette.avatarRing }}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 bg-white shadow-xs"
          >
            {profile.avatarImageUrl ? (
              <img
                src={profile.avatarImageUrl}
                alt={profile.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-4xl leading-none" aria-hidden="true">
                {profile.avatarEmoji}
              </span>
            )}
          </div>
          <div className="text-start">
            <h2 style={{ color: palette.textPrimary }} className="text-xl font-bold leading-relaxed">
              {profile.name}
            </h2>
            {isParentUnlocked && onOpenAdminForChild && (
              <button
                type="button"
                onClick={() => onOpenAdminForChild(profile.id)}
                className="pressable mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/85 px-2.5 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-300 cursor-pointer"
              >
                + הוספת שגרה / משימה
              </button>
            )}
          </div>
        </div>

        <div
          data-testid={`child-stars-${profile.id}`}
          className="gold-star-badge inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-base font-bold tabular-nums"
        >
          <span aria-hidden="true">⭐</span>
          <span>{profile.totalStars}</span>
        </div>
      </header>

      {/* 2. The 3 Dual-Color SVG Progress Rings (☀️, 🌤️, 🌙) */}
      <div className="grid grid-cols-3 gap-2 pb-4" role="group" aria-label={`טבעות התקדמות של ${profile.name}`}>
        {TIME_WINDOWS.map((w) => (
          <DualColorRing
            key={w}
            window={w}
            ring={profile.rings[w]}
            isSelected={selectedWindow === w}
            onSelect={() => setSelectedWindow(w)}
          />
        ))}
      </div>

      {/* 3. Active Task List: Selected Window's Routines + Always-Visible Personal Chores */}
      <div className="flex flex-1 flex-col gap-2.5">
        {isWindowAllDone ? (
          <div
            data-testid={`window-celebration-${profile.id}`}
            className="rounded-2xl border border-emerald-300 bg-emerald-50/95 px-4 py-3.5 text-center text-base font-medium text-emerald-900 leading-relaxed"
          >
            🎉 כל הכבוד! סיימת את כל משימות ה{windowLabelHe}!
          </div>
        ) : visibleRoutines.length === 0 && activeWindowRing.totalScheduled === 0 ? (
          <div className="rounded-2xl bg-white/55 px-4 py-3 text-center text-sm text-slate-500">
            אין שגרות מתוזמנות ל{windowLabelHe}
          </div>
        ) : (
          visibleRoutines.map((routine) => (
            <TaskCard
              key={`routine-${routine.id}`}
              testId={`routine-card-${routine.id}`}
              emoji={routine.iconEmoji}
              title={routine.title}
              cardBg={palette.cardBg}
              borderColor={palette.borderAccent}
              textColor={palette.textPrimary}
              disabled={busyKey === `routine-${routine.id}`}
              onToggle={() => onToggleRoutine(routine.id, routine.timeWindow)}
            />
          ))
        )}

        {profile.pendingChores.map((chore) => (
          <TaskCard
            key={`chore-${chore.id}`}
            testId={`personal-chore-card-${chore.id}`}
            emoji={chore.iconEmoji}
            title={chore.title}
            stars={chore.stars}
            cardBg={palette.cardBg}
            borderColor={palette.borderAccent}
            textColor={palette.textPrimary}
            disabled={busyKey === `chore-${chore.id}`}
            onToggle={() => onTogglePersonalChore(chore.id)}
          />
        ))}
      </div>

      {/* 4. Collapsible "הושלמו היום (X)" Drawer at Column Bottom */}
      {profile.completedToday.length > 0 && (
        <div className="mt-4 border-t border-slate-900/10 pt-3">
          <button
            type="button"
            data-testid={`completed-drawer-toggle-${profile.id}`}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((prev) => !prev)}
            style={{ color: palette.textPrimary }}
            className="pressable flex w-full items-center justify-between rounded-xl bg-white/60 px-3.5 py-2 text-sm font-medium cursor-pointer hover:bg-white/85"
          >
            <span>הושלמו היום ({profile.completedToday.length})</span>
            <span aria-hidden="true" className="text-xs">
              {drawerOpen ? '▲' : '▼'}
            </span>
          </button>

          {drawerOpen && (
            <div data-testid={`completed-drawer-list-${profile.id}`} className="mt-2.5 flex flex-col gap-2">
              {profile.completedToday.map((item) => (
                <TaskCard
                  key={`${item.kind}-${item.id}`}
                  testId={`completed-item-${item.kind}-${item.id}`}
                  emoji={item.iconEmoji}
                  title={item.title}
                  stars={item.kind === 'ROUTINE' ? 0 : item.stars}
                  completed
                  cardBg={palette.cardCompletedBg}
                  borderColor={palette.borderAccent}
                  textColor={palette.textPrimary}
                  disabled={busyKey === `undo-${item.kind}-${item.id}`}
                  onToggle={() => onUndoCompletedItem(item)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
