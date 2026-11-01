import { useEffect, useState } from 'react';

interface PinModalProps {
  open: boolean;
  onUnlock: (pin: string) => Promise<void>;
  onClose: () => void;
}

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function PinModal({ open, onUnlock, onClose }: PinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin('');
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const submitPin = async (nextPin: string) => {
    setSubmitting(true);
    setError(null);
    try {
      await onUnlock(nextPin);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'קוד הורים שגוי');
      setPin('');
      setSubmitting(false);
    }
  };

  const appendDigit = (digit: string) => {
    if (submitting || pin.length >= 4) return;
    const next = `${pin}${digit}`;
    setPin(next);
    setError(null);
    if (next.length === 4) {
      void submitPin(next);
    }
  };

  const backspace = () => {
    if (submitting) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      } else if (/^\d$/.test(e.key)) {
        appendDigit(e.key);
      } else if (e.key === 'Backspace') {
        backspace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
      data-testid="pin-modal"
      onClick={() => {
        if (!submitting) onClose();
      }}
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel w-full max-w-xs rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
            🔒
          </div>
          <h2 id="pin-modal-title" className="mt-2 text-xl font-bold text-slate-900">
            פתיחת אזור הורים
          </h2>
          <p className="mt-1 text-sm text-slate-500">הקישו קוד בן 4 ספרות</p>
        </div>

        {/* 4 PIN Dots */}
        <div
          data-testid="pin-dots"
          dir="ltr"
          className="my-5 flex items-center justify-center gap-3.5"
        >
          {[0, 1, 2, 3].map((idx) => {
            const filled = idx < pin.length;
            return (
              <span
                key={idx}
                className={[
                  'h-4 w-4 rounded-full border-2 transition-colors duration-150',
                  filled ? 'border-amber-500 bg-amber-500' : 'border-slate-300 bg-slate-100',
                ].join(' ')}
              />
            );
          })}
        </div>

        {error && (
          <p
            role="alert"
            data-testid="pin-error"
            className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-center text-sm font-medium text-rose-700"
          >
            {error}
          </p>
        )}

        {/* Numeric Keypad (LTR layout for standard phone keypad order 1-2-3) */}
        <div dir="ltr" className="grid grid-cols-3 gap-2.5">
          {KEYPAD_DIGITS.map((digit) => (
            <button
              key={digit}
              type="button"
              disabled={submitting}
              data-testid={`pin-key-${digit}`}
              onClick={() => appendDigit(digit)}
              className="pressable flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-900 tabular-nums cursor-pointer hover:bg-slate-200 disabled:opacity-50"
            >
              {digit}
            </button>
          ))}

          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="pressable flex h-14 items-center justify-center rounded-2xl bg-slate-50 text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-100"
          >
            ביטול
          </button>

          <button
            type="button"
            disabled={submitting}
            data-testid="pin-key-0"
            onClick={() => appendDigit('0')}
            className="pressable flex h-14 items-center justify-center rounded-2xl bg-slate-100 text-xl font-bold text-slate-900 tabular-nums cursor-pointer hover:bg-slate-200 disabled:opacity-50"
          >
            0
          </button>

          <button
            type="button"
            disabled={submitting || pin.length === 0}
            data-testid="pin-key-backspace"
            aria-label="מחיקה"
            onClick={backspace}
            className="pressable flex h-14 items-center justify-center rounded-2xl bg-slate-50 text-lg font-bold text-slate-700 cursor-pointer hover:bg-slate-100 disabled:opacity-40"
          >
            ⌫
          </button>
        </div>
      </div>
    </div>
  );
}
