/**
 * Skylight visual tokens: 10 child pastels, the Metallic Gold "קופת המשימות" pool theme,
 * ring colors, and the kid emoji catalog. Consumed by the web app (CSS variables) and by
 * the server (pastelTheme enum).
 */

export const PASTEL_THEMES = [
  'SKY',
  'CORAL',
  'MINT',
  'LAVENDER',
  'BUTTERCUP',
  'ROSE',
  'SAGE',
  'PERIWINKLE',
  'APRICOT',
  'AQUA',
] as const;
export type PastelTheme = (typeof PASTEL_THEMES)[number];

export interface PastelPalette {
  labelHe: string;
  /** Ultra-soft column wash. */
  columnBg: string;
  /** Richer pastel task-card surface. */
  cardBg: string;
  /** Muted surface for completed cards. */
  cardCompletedBg: string;
  borderAccent: string;
  avatarRing: string;
  /** Deep, high-contrast text for effortless reading on `cardBg`. */
  textPrimary: string;
}

export const PASTEL_PALETTES = {
  SKY: { labelHe: 'תכלת שמיים', columnBg: '#F0F7FF', cardBg: '#DCEEFF', cardCompletedBg: '#EAF3FB', borderAccent: '#93C5FD', avatarRing: '#60A5FA', textPrimary: '#1E3A5F' },
  CORAL: { labelHe: 'אפרסק קורל', columnBg: '#FFF4F0', cardBg: '#FFE0D6', cardCompletedBg: '#FBEDE8', borderAccent: '#FDA48A', avatarRing: '#FB7F5E', textPrimary: '#5C2418' },
  MINT: { labelHe: 'מנטה רענן', columnBg: '#EFFCF6', cardBg: '#D3F5E6', cardCompletedBg: '#E7F6EF', borderAccent: '#86E0B8', avatarRing: '#34C78E', textPrimary: '#134E3A' },
  LAVENDER: { labelHe: 'לבנדר רך', columnBg: '#F6F3FF', cardBg: '#E7E0FF', cardCompletedBg: '#F0ECFA', borderAccent: '#B9A7F5', avatarRing: '#9278EE', textPrimary: '#35265E' },
  BUTTERCUP: { labelHe: 'צהוב חמאה', columnBg: '#FFFCEB', cardBg: '#FFF3C2', cardCompletedBg: '#FAF5DE', borderAccent: '#F5D766', avatarRing: '#E8BE2E', textPrimary: '#4F3D06' },
  ROSE: { labelHe: 'ורוד בייבי', columnBg: '#FFF2F6', cardBg: '#FFDDE8', cardCompletedBg: '#FAEBF0', borderAccent: '#F7A1BD', avatarRing: '#F0709A', textPrimary: '#5E1A33' },
  SAGE: { labelHe: 'ירוק מרווה', columnBg: '#F3F7F1', cardBg: '#E0EBDA', cardCompletedBg: '#EDF1EA', borderAccent: '#A9C29C', avatarRing: '#7FA06E', textPrimary: '#2C3D24' },
  PERIWINKLE: { labelHe: 'כחול לילך', columnBg: '#F2F4FF', cardBg: '#DDE2FF', cardCompletedBg: '#ECEEFA', borderAccent: '#A3AEF5', avatarRing: '#7684EC', textPrimary: '#1F2A5E' },
  APRICOT: { labelHe: 'משמש חם', columnBg: '#FFF7EE', cardBg: '#FFE6CC', cardCompletedBg: '#FAF0E4', borderAccent: '#FBBF85', avatarRing: '#F59E4C', textPrimary: '#5A3410' },
  AQUA: { labelHe: 'טורקיז לגונה', columnBg: '#EFFCFC', cardBg: '#CFF4F4', cardCompletedBg: '#E5F5F5', borderAccent: '#7DD8D8', avatarRing: '#2EC4C4', textPrimary: '#0F4747' },
} as const satisfies Record<PastelTheme, PastelPalette>;

/** "Treasure / Bounty" column for the shared household pool. */
export const GOLD_POOL_THEME = {
  labelHe: 'קופת המשימות',
  columnBg: 'linear-gradient(145deg, #FFFDF5 0%, #FDF3C7 50%, #FDE68A 100%)',
  border: '#F59E0B',
  borderDeep: '#D97706',
  cardBg: '#FFFBEB',
  starBadgeBg: 'linear-gradient(135deg, #FDE68A 0%, #F59E0B 100%)',
  textPrimary: '#78350F',
} as const;

/** Dual-color progress ring strokes. */
export const RING_COLORS = {
  completed: '#10B981',
  remaining: '#E5E7EB',
  missed: '#F43F5E',
} as const;

export const EMOJI_CATEGORIES = ['hygiene', 'school', 'room', 'kitchen', 'pets', 'sports', 'fun', 'avatars'] as const;
export type EmojiCategory = (typeof EMOJI_CATEGORIES)[number];

export const EMOJI_CATALOG = {
  hygiene: { labelHe: 'היגיינה', emojis: ['🪥', '🛁', '🚿', '🧼', '🧴', '💇', '🚽', '🧻', '💅', '👕'] },
  school: { labelHe: 'בית ספר', emojis: ['🎒', '📚', '✏️', '📝', '📖', '🖍️', '📐', '💻', '🎻', '🏫'] },
  room: { labelHe: 'חדר', emojis: ['🛏️', '🧸', '🧺', '👟', '🧦', '🗄️', '🪴', '💡', '🧹', '🪣'] },
  kitchen: { labelHe: 'מטבח', emojis: ['🍽️', '🥣', '🥪', '🍎', '🥛', '🧃', '🫧', '🗑️', '♻️', '🥗'] },
  pets: { labelHe: 'חיות מחמד', emojis: ['🐶', '🐱', '🐟', '🐰', '🐹', '🦜', '🐢', '🦴', '🐾', '🥕'] },
  sports: { labelHe: 'ספורט', emojis: ['⚽', '🏀', '🚴', '🏊', '🤸', '🎾', '🥋', '🛹', '🏃', '🩰'] },
  fun: { labelHe: 'כיף', emojis: ['🎨', '🧩', '🎹', '🎮', '📺', '🌳', '🎲', '🪁', '🎉', '🌟'] },
  avatars: { labelHe: 'דמויות', emojis: ['🦁', '🦄', '🦖', '🦊', '🐼', '🚀', '⚽', '🎨', '🐯', '🐨', '🐸', '🐙', '🦋', '🐵', '🦉', '🐳'] },
} as const satisfies Record<EmojiCategory, { labelHe: string; emojis: readonly string[] }>;
