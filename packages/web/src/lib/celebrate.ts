import confetti from 'canvas-confetti';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Joyful pastel confetti burst when a child finishes 100% of a time window's routines. */
export function burstWindowCelebration(): void {
  if (prefersReducedMotion()) return;
  try {
    void confetti({
      particleCount: 55,
      spread: 68,
      origin: { y: 0.65 },
      colors: ['#10B981', '#60A5FA', '#FB7F5E', '#FBBF24', '#A78BFA'],
      disableForReducedMotion: true,
    });
  } catch {
    // Ignore canvas errors in headless environments
  }
}

/** Metallic gold star-burst celebration when claiming a קופת המשימות mission. */
export function burstGoldStars(): void {
  if (prefersReducedMotion()) return;
  try {
    void confetti({
      particleCount: 70,
      spread: 78,
      origin: { y: 0.6 },
      shapes: ['star', 'circle'],
      colors: ['#F59E0B', '#FDE047', '#FBBF24', '#FEF08A', '#10B981'],
      disableForReducedMotion: true,
    });
  } catch {
    // Ignore canvas errors in headless environments
  }
}
