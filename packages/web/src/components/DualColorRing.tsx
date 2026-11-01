import { RING_COLORS, TIME_WINDOW_META, type RingState, type TimeWindow } from '@eshnav/shared';

interface DualColorRingProps {
  window: TimeWindow;
  ring: RingState;
  isSelected?: boolean;
  onSelect?: () => void;
}

const RADIUS = 23;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DualColorRing({ window, ring, isSelected = false, onSelect }: DualColorRingProps) {
  const meta = TIME_WINDOW_META[window];
  const { totalScheduled, completedCount, redMissedCount, greyRemainingCount, isWindowElapsed } = ring;

  const hasMissedRed = isWindowElapsed && redMissedCount > 0;
  const trackColor =
    totalScheduled === 0
      ? RING_COLORS.remaining
      : hasMissedRed
        ? RING_COLORS.missed
        : completedCount === totalScheduled
          ? RING_COLORS.completed
          : RING_COLORS.remaining;

  const completedLength =
    totalScheduled > 0 ? Math.min(1, completedCount / totalScheduled) * CIRCUMFERENCE : 0;

  const interactive = typeof onSelect === 'function';
  const Tag = interactive ? 'button' : 'div';

  return (
    <Tag
      {...(interactive ? { type: 'button' as const, onClick: onSelect } : {})}
      data-testid={`ring-${window}`}
      data-window={window}
      data-elapsed={String(isWindowElapsed)}
      data-completed={completedCount}
      data-missed={redMissedCount}
      data-remaining={greyRemainingCount}
      data-total={totalScheduled}
      aria-pressed={interactive ? isSelected : undefined}
      aria-label={`${meta.labelHe}: ${completedCount} מתוך ${totalScheduled} הושלמו`}
      className={[
        'flex flex-col items-center gap-1 rounded-2xl px-2.5 py-2',
        interactive ? 'pressable cursor-pointer' : '',
        isSelected
          ? 'bg-white/95 shadow-sm ring-2 ring-slate-900/15'
          : interactive
            ? 'bg-white/45 hover:bg-white/75'
            : 'bg-white/65',
      ].join(' ')}
    >
      <div className="relative flex h-14 w-14 items-center justify-center">
        <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden="true">
          <circle
            cx="28"
            cy="28"
            r={RADIUS}
            fill="none"
            stroke={trackColor}
            strokeWidth="5.5"
            data-ring-track-color={trackColor}
            className="ring-arc"
          />
          {completedCount > 0 && totalScheduled > 0 && (
            <circle
              cx="28"
              cy="28"
              r={RADIUS}
              fill="none"
              stroke={RING_COLORS.completed}
              strokeWidth="5.5"
              strokeDasharray={`${completedLength} ${CIRCUMFERENCE}`}
              strokeLinecap={completedCount === totalScheduled ? 'butt' : 'round'}
              data-ring-completed-color={RING_COLORS.completed}
              className="ring-arc"
            />
          )}
        </svg>
        <span className="absolute text-xl leading-none" aria-hidden="true">
          {meta.emoji}
        </span>
      </div>

      <span className="text-xs font-medium text-slate-700 leading-tight">{meta.labelHe}</span>
      <span
        className={[
          'text-xs font-bold tabular-nums leading-none',
          hasMissedRed
            ? 'text-rose-600'
            : totalScheduled > 0 && completedCount === totalScheduled
              ? 'text-emerald-600'
              : 'text-slate-500',
        ].join(' ')}
      >
        {totalScheduled === 0 ? '—' : `${completedCount}/${totalScheduled}`}
      </span>
    </Tag>
  );
}
