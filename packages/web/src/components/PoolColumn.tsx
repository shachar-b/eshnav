import { GOLD_POOL_THEME, type BoardPoolChore } from '@eshnav/shared';
import { TaskCard } from './TaskCard.js';

interface PoolColumnProps {
  poolChores: BoardPoolChore[];
  isParentUnlocked: boolean;
  onSelectChoreToComplete: (chore: BoardPoolChore) => void;
  onOpenPoolSwitchboard: () => void;
}

export function PoolColumn({
  poolChores,
  isParentUnlocked,
  onSelectChoreToComplete,
  onOpenPoolSwitchboard,
}: PoolColumnProps) {
  return (
    <section
      data-testid="pool-column"
      className="gold-pool-surface flex flex-col rounded-3xl p-4"
    >
      <div className="gold-shimmer-bar pointer-events-none absolute inset-x-0 top-0 h-1.5" aria-hidden="true" />

      <header className="flex items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-amber-500 bg-amber-50 shadow-xs">
            <span className="text-3xl leading-none" aria-hidden="true">
              ✨
            </span>
          </div>
          <div className="text-start">
            <h2 style={{ color: GOLD_POOL_THEME.textPrimary }} className="text-xl font-bold leading-relaxed">
              {GOLD_POOL_THEME.labelHe}
            </h2>
            <p className="text-xs font-medium text-amber-900/80">משימות בונוס לכל אלופי הבית</p>
          </div>
        </div>

        <span
          data-testid="pool-available-count"
          className="gold-star-badge inline-flex h-9 min-w-9 items-center justify-center rounded-full px-2.5 text-sm font-bold tabular-nums"
        >
          {poolChores.length}
        </span>
      </header>

      {isParentUnlocked && (
        <button
          type="button"
          onClick={onOpenPoolSwitchboard}
          className="pressable mb-3 flex items-center justify-center gap-1.5 rounded-2xl border border-amber-500/80 bg-white/85 px-3 py-2 text-sm font-bold text-amber-950 cursor-pointer hover:bg-white"
        >
          ⚙️ מתגי הפעלה ועריכת קופת המשימות
        </button>
      )}

      <div className="flex flex-1 flex-col gap-2.5">
        {poolChores.length === 0 ? (
          <div className="rounded-2xl border border-amber-300/70 bg-white/75 px-4 py-6 text-center text-base font-medium text-amber-950 leading-relaxed">
            🌟 כל משימות הקופה בוצעו! כל הכבוד!
          </div>
        ) : (
          poolChores.map((chore) => (
            <TaskCard
              key={chore.id}
              testId={`pool-chore-card-${chore.id}`}
              emoji={chore.iconEmoji}
              title={chore.title}
              stars={chore.stars}
              variant="gold"
              cardBg={GOLD_POOL_THEME.cardBg}
              borderColor={GOLD_POOL_THEME.border}
              textColor={GOLD_POOL_THEME.textPrimary}
              onToggle={() => onSelectChoreToComplete(chore)}
            />
          ))
        )}
      </div>
    </section>
  );
}
