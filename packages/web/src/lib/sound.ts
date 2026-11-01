/**
 * Zero-dependency Web Audio API synthesizer for gentle task chimes and 100% ring fanfares.
 * Safe in headless browsers and respects mute preferences.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function scheduleTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  peakGain: number,
  type: OscillatorType = 'triangle',
) {
  const now = ctx.currentTime + startOffsetSec;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

/** Gentle marimba-like two-note chime when checking off a routine or chore. */
export function playCheckChime(enabled: boolean): void {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    scheduleTone(ctx, 587.33, 0, 0.14, 0.14, 'triangle'); // D5
    scheduleTone(ctx, 880.0, 0.07, 0.22, 0.16, 'triangle'); // A5
  } catch {
    // Ignore autoplay/headless audio errors
  }
}

/** Cheerful 3-note major fanfare chord when a routine ring reaches 100% or a pool chore is won. */
export function playFanfareChord(enabled: boolean): void {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    scheduleTone(ctx, 523.25, 0, 0.16, 0.14, 'triangle'); // C5
    scheduleTone(ctx, 659.25, 0.09, 0.18, 0.15, 'triangle'); // E5
    scheduleTone(ctx, 783.99, 0.18, 0.34, 0.16, 'triangle'); // G5
    scheduleTone(ctx, 1046.5, 0.18, 0.38, 0.1, 'sine'); // C6 shimmer
  } catch {
    // Ignore autoplay/headless audio errors
  }
}

/** Soft low tap when unchecking a completed item. */
export function playUndoTick(enabled: boolean): void {
  if (!enabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    scheduleTone(ctx, 392.0, 0, 0.1, 0.08, 'sine'); // G4
  } catch {
    // Ignore autoplay/headless audio errors
  }
}
