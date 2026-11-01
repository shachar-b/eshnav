import { useCallback, useEffect, useState } from 'react';
import {
  PASTEL_PALETTES,
  TIME_WINDOWS,
  TIME_WINDOW_META,
  shiftLogicalDate,
  type HistoryResponse,
} from '@eshnav/shared';
import { api } from '../lib/api.js';
import {
  formatCompletionTime,
  formatLogicalDateHebrew,
  getRelativeDayLabel,
} from '../lib/hebrewDate.js';
import { DualColorRing } from './DualColorRing.js';

interface HistoryViewProps {
  todayLogicalDate: string;
  isParentUnlocked: boolean;
  onBackToBoard: () => void;
  onRequestUnlock: () => void;
  onLockParent: () => void;
}

export function HistoryView({
  todayLogicalDate,
  isParentUnlocked,
  onBackToBoard,
  onRequestUnlock,
  onLockParent,
}: HistoryViewProps) {
  // Default to yesterday so parents immediately see the sealed Green/Red audit day, with 1-tap "היום" / stepper
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    shiftLogicalDate(todayLogicalDate, -1),
  );
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingRoutineId, setTogglingRoutineId] = useState<number | null>(null);

  const loadHistory = useCallback(async (date: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getHistory(date);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת היסטוריה');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory(selectedDate);
  }, [selectedDate, loadHistory]);

  const canStepForward = selectedDate < todayLogicalDate;
  const relativeLabel = getRelativeDayLabel(selectedDate, todayLogicalDate);
  const canEditPastRoutines = isParentUnlocked && selectedDate < todayLogicalDate;

  const handleToggleRoutine = async (routineId: number | null) => {
    if (!canEditPastRoutines || routineId === null || togglingRoutineId !== null) return;
    setTogglingRoutineId(routineId);
    try {
      await api.toggleHistoryRoutine(routineId, selectedDate);
      await loadHistory(selectedDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון שגרה');
    } finally {
      setTogglingRoutineId(null);
    }
  };

  return (
    <div data-testid="history-view" className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 py-4 sm:px-6">
      {/* Header & Date Stepper */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="history-back-btn"
            onClick={onBackToBoard}
            className="pressable inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-base font-bold text-slate-800 cursor-pointer hover:bg-slate-200"
          >
            <span>חזרה ללוח</span>
          </button>

          {selectedDate !== todayLogicalDate && (
            <button
              type="button"
              data-testid="history-jump-today"
              onClick={() => setSelectedDate(todayLogicalDate)}
              className="pressable inline-flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 cursor-pointer hover:bg-slate-50"
            >
              חזרה להיום
            </button>
          )}
        </div>

        {/* Date Stepper: ◀ (Previous Day) | Date + Picker | ▶ (Next Day) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="history-prev-day"
            aria-label="היום הקודם"
            onClick={() => setSelectedDate((d) => shiftLogicalDate(d, -1))}
            className="pressable flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-base font-bold text-slate-700 cursor-pointer hover:bg-slate-100"
          >
            ▶
          </button>

          <div className="flex flex-wrap items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-2">
            <span data-testid="history-formatted-date" className="text-base font-bold text-slate-900">
              {formatLogicalDateHebrew(selectedDate)}
            </span>
            {relativeLabel && (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-900">
                {relativeLabel}
              </span>
            )}
            <input
              type="date"
              aria-label="בחירת תאריך"
              data-testid="history-date-input"
              value={selectedDate}
              max={todayLogicalDate}
              onChange={(e) => {
                if (e.target.value && e.target.value <= todayLogicalDate) {
                  setSelectedDate(e.target.value);
                }
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700 tabular-nums"
            />
          </div>

          <button
            type="button"
            data-testid="history-next-day"
            aria-label="היום הבא"
            disabled={!canStepForward}
            onClick={() => {
              if (canStepForward) setSelectedDate((d) => shiftLogicalDate(d, 1));
            }}
            className="pressable flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-base font-bold text-slate-700 cursor-pointer hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
          >
            ◀
          </button>
        </div>

        {/* Lock / Unlock Indicator */}
        <div className="flex items-center gap-2">
          <span
            data-testid="history-mode-badge"
            className={[
              'rounded-full px-3 py-1 text-xs font-bold',
              canEditPastRoutines
                ? 'bg-amber-100 text-amber-900'
                : 'bg-slate-100 text-slate-600',
            ].join(' ')}
          >
            {canEditPastRoutines ? 'מצב עריכת הורים פעיל' : 'צפייה בלבד'}
          </span>

          <button
            type="button"
            data-testid="history-lock-btn"
            aria-label={isParentUnlocked ? 'נעילת אזור הורים' : 'פתיחת אזור הורים'}
            onClick={isParentUnlocked ? onLockParent : onRequestUnlock}
            className={[
              'pressable flex h-12 w-12 items-center justify-center rounded-2xl text-xl cursor-pointer',
              isParentUnlocked
                ? 'bg-amber-400 text-amber-950 shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            ].join(' ')}
          >
            {isParentUnlocked ? '🔓' : '🔒'}
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          {error}
        </div>
      )}

      {loading && !history ? (
        <div className="flex flex-1 items-center justify-center py-16 text-lg font-medium text-slate-500">
          טוען היסטוריה...
        </div>
      ) : (
        history && (
          <main className="mt-4 grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {history.profiles.map((child) => {
              const palette = PASTEL_PALETTES[child.pastelTheme];
              return (
                <section
                  key={child.id}
                  data-testid={`history-child-${child.id}`}
                  style={{
                    backgroundColor: palette.columnBg,
                    borderColor: palette.borderAccent,
                  }}
                  className="flex flex-col rounded-3xl border-2 p-4 shadow-xs"
                >
                  {/* Child Header + Daily Star Summary */}
                  <div className="flex items-center justify-between gap-3 pb-3">
                    <div className="flex items-center gap-3">
                      <div
                        style={{ borderColor: palette.avatarRing }}
                        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-4 bg-white text-3xl"
                      >
                        {child.avatarImageUrl ? (
                          <img src={child.avatarImageUrl} alt={child.name} className="h-full w-full object-cover" />
                        ) : (
                          child.avatarEmoji
                        )}
                      </div>
                      <div className="text-start">
                        <h2 style={{ color: palette.textPrimary }} className="text-xl font-bold leading-relaxed">
                          {child.name}
                        </h2>
                        <p className="text-xs font-medium text-slate-600 tabular-nums">
                          סה״כ בקופה: ⭐ {child.totalStars}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-amber-100/90 px-3 py-1.5 text-xs font-bold text-amber-950 ring-1 ring-amber-300 tabular-nums">
                      ⭐ {child.starsEarnedThatDay >= 0 ? `+${child.starsEarnedThatDay}` : child.starsEarnedThatDay}{' '}
                      כוכבים ביום זה
                    </div>
                  </div>

                  {/* The 3 Green/Red Audit Rings */}
                  <div className="grid grid-cols-3 gap-2 pb-4">
                    {TIME_WINDOWS.map((w) => (
                      <DualColorRing key={w} window={w} ring={child.rings[w]} />
                    ))}
                  </div>

                  {/* Detailed Drill-Down List */}
                  <div className="flex flex-1 flex-col gap-2">
                    <h3 className="text-xs font-bold text-slate-600">שגרות היום</h3>
                    {child.routines.length === 0 ? (
                      <p className="rounded-2xl bg-white/60 px-3 py-3 text-center text-sm text-slate-500">
                        לא היו שגרות מתוזמנות ביום זה
                      </p>
                    ) : (
                      child.routines.map((routine, idx) => {
                        const isCompleted = routine.status === 'COMPLETED';
                        const isMissed = routine.status === 'MISSED';
                        const timeLabel = formatCompletionTime(routine.completedAt);
                        const windowMeta = TIME_WINDOW_META[routine.timeWindow];
                        const editable = canEditPastRoutines && routine.routineId !== null;

                        return (
                          <button
                            key={`${routine.routineId ?? 'deleted'}-${idx}`}
                            type="button"
                            disabled={!editable || togglingRoutineId === routine.routineId}
                            data-testid={
                              routine.routineId !== null
                                ? `history-routine-${routine.routineId}`
                                : `history-routine-snapshot-${idx}`
                            }
                            data-status={routine.status}
                            onClick={() => void handleToggleRoutine(routine.routineId)}
                            className={[
                              'flex w-full items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-start',
                              isMissed
                                ? 'border-rose-300 bg-rose-50/95 text-rose-950'
                                : isCompleted
                                  ? 'border-emerald-200 bg-white/90 text-slate-900'
                                  : 'border-slate-200 bg-white/70 text-slate-700',
                              editable ? 'pressable cursor-pointer hover:ring-2 hover:ring-amber-400' : 'cursor-default',
                            ].join(' ')}
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <span className="text-2xl leading-none" aria-hidden="true">
                                {routine.iconEmoji}
                              </span>
                              <div className="min-w-0">
                                <p className="text-base font-medium leading-relaxed break-words">
                                  {routine.title}
                                </p>
                                <p className="text-xs text-slate-500">
                                  {windowMeta.emoji} {windowMeta.labelHe}
                                </p>
                              </div>
                            </div>

                            {isCompleted ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 tabular-nums">
                                <span>✅ בוצע</span>
                                {timeLabel && <span>{timeLabel}</span>}
                              </span>
                            ) : isMissed ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-200/90 px-2.5 py-1 text-xs font-bold text-rose-900">
                                ❌ לא בוצע
                              </span>
                            ) : (
                              <span className="inline-flex shrink-0 items-center rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
                                ממתין
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}

                    {child.chores.length > 0 && (
                      <>
                        <h3 className="mt-2 text-xs font-bold text-slate-600">משימות וכוכבים שהושלמו</h3>
                        {child.chores.map((chore) => {
                          const timeLabel = formatCompletionTime(chore.completedAt);
                          return (
                            <div
                              key={`${chore.kind}-${chore.id}`}
                              className="flex items-center justify-between gap-2 rounded-2xl border border-amber-300/80 bg-amber-50/90 px-3.5 py-2.5"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="text-2xl leading-none" aria-hidden="true">
                                  {chore.iconEmoji}
                                </span>
                                <span className="text-base font-medium text-amber-950 leading-relaxed break-words">
                                  {chore.title}
                                </span>
                              </div>
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-200/80 px-2.5 py-1 text-xs font-bold text-amber-950 tabular-nums">
                                <span>⭐ +{chore.stars}</span>
                                {timeLabel && <span>({timeLabel})</span>}
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                </section>
              );
            })}
          </main>
        )
      )}
    </div>
  );
}
