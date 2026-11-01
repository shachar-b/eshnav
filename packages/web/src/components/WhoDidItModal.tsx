import { useEffect } from 'react';
import { PASTEL_PALETTES, type BoardPoolChore, type BoardProfile } from '@eshnav/shared';

interface WhoDidItModalProps {
  chore: BoardPoolChore | null;
  profiles: BoardProfile[];
  busy: boolean;
  onSelectChild: (profileId: number) => void;
  onClose: () => void;
}

export function WhoDidItModal({
  chore,
  profiles,
  busy,
  onSelectChild,
  onClose,
}: WhoDidItModalProps) {
  useEffect(() => {
    if (!chore) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [chore, busy, onClose]);

  if (!chore) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="who-did-it-title"
      data-testid="who-did-it-modal"
      onClick={() => {
        if (!busy) onClose();
      }}
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel w-full max-w-lg rounded-3xl border-2 border-amber-400 bg-amber-50 p-6 shadow-xl"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-amber-400 bg-white text-4xl shadow-xs">
            {chore.iconEmoji}
          </div>
          <h2 id="who-did-it-title" className="text-2xl font-bold text-amber-950 leading-relaxed">
            מי אלוף הבית שביצע את המשימה?
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium text-amber-900 leading-relaxed">{chore.title}</span>
            {chore.stars > 0 && (
              <span className="gold-star-badge rounded-full px-3 py-0.5 text-sm font-bold tabular-nums">
                +{chore.stars} ⭐
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {profiles.map((child) => {
            const palette = PASTEL_PALETTES[child.pastelTheme];
            return (
              <button
                key={child.id}
                type="button"
                disabled={busy}
                data-testid={`who-did-it-avatar-${child.id}`}
                onClick={() => onSelectChild(child.id)}
                style={{
                  backgroundColor: palette.cardBg,
                  borderColor: palette.avatarRing,
                  color: palette.textPrimary,
                }}
                className="pressable flex flex-col items-center gap-2 rounded-3xl border-3 p-4 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <div
                  style={{ borderColor: palette.avatarRing }}
                  className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 bg-white text-5xl"
                >
                  {child.avatarImageUrl ? (
                    <img
                      src={child.avatarImageUrl}
                      alt={child.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span aria-hidden="true">{child.avatarEmoji}</span>
                  )}
                </div>
                <span className="text-lg font-bold leading-relaxed">{child.name}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="pressable rounded-full bg-white px-6 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 cursor-pointer hover:bg-slate-100"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
