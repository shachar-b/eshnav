interface TaskCardProps {
  emoji: string;
  title: string;
  stars?: number;
  completed?: boolean;
  variant?: 'pastel' | 'gold';
  cardBg: string;
  borderColor: string;
  textColor: string;
  onToggle: () => void;
  disabled?: boolean;
  testId?: string;
}

/**
 * Enforces SPEC §3.2 Strict 3-Element Task Card Rule:
 * 1. Large Emoji (`text-3xl`) at start (right).
 * 2. Task Title (`text-lg font-medium leading-relaxed`) + optional `⭐ X` pill (if `stars > 0`).
 * 3. Giant Check Circle (`w-11 h-11 rounded-full border-2 bg-white`) at end (left).
 */
export function TaskCard({
  emoji,
  title,
  stars = 0,
  completed = false,
  variant = 'pastel',
  cardBg,
  borderColor,
  textColor,
  onToggle,
  disabled = false,
  testId,
}: TaskCardProps) {
  return (
    <div
      data-testid={testId ?? 'task-card'}
      data-completed={String(completed)}
      style={{
        backgroundColor: cardBg,
        borderColor,
        color: textColor,
      }}
      className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-xs"
    >
      <span className="shrink-0 text-3xl leading-none" aria-hidden="true">
        {emoji}
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-start">
        <span
          className={[
            'text-lg font-medium leading-relaxed break-words',
            completed ? 'line-through opacity-65' : '',
          ].join(' ')}
        >
          {title}
        </span>

        {stars > 0 && (
          <span
            className={
              variant === 'gold'
                ? 'gold-star-badge inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums'
                : 'inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100/95 px-2.5 py-0.5 text-sm font-bold text-amber-900 ring-1 ring-amber-300/80 tabular-nums'
            }
          >
            {variant === 'gold' ? `✨ ⭐ +${stars}` : `⭐ ${stars}`}
          </span>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        aria-label={completed ? `ביטול סימון: ${title}` : `סימון בוצע: ${title}`}
        style={!completed ? { borderColor } : undefined}
        className={[
          'pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 cursor-pointer disabled:opacity-50',
          completed
            ? 'border-emerald-500 bg-emerald-500 text-white shadow-xs'
            : 'bg-white text-transparent hover:bg-emerald-50',
        ].join(' ')}
      >
        {completed ? (
          <span className="text-lg font-bold leading-none text-white" aria-hidden="true">
            ✓
          </span>
        ) : (
          <span className="sr-only">סמן</span>
        )}
      </button>
    </div>
  );
}
