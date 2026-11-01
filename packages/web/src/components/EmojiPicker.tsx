import { useState } from 'react';
import { EMOJI_CATALOG, EMOJI_CATEGORIES, type EmojiCategory } from '@eshnav/shared';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  defaultCategory?: EmojiCategory;
}

export function EmojiPicker({ value, onChange, defaultCategory = 'hygiene' }: EmojiPickerProps) {
  const [category, setCategory] = useState<EmojiCategory>(defaultCategory);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {EMOJI_CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={[
              'pressable rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer',
              category === cat
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100',
            ].join(' ')}
          >
            {EMOJI_CATALOG[cat].labelHe}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {EMOJI_CATALOG[category].emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onChange(emoji)}
            className={[
              'pressable flex h-10 w-10 items-center justify-center rounded-xl text-2xl cursor-pointer',
              value === emoji
                ? 'bg-amber-200 ring-2 ring-amber-500'
                : 'bg-white hover:bg-slate-100',
            ].join(' ')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
