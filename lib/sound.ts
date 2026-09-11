/**
 * Completion tones, generated with the Web Audio API. No audio files.
 *
 * The mechanic: completions within 20s of each other climb a pentatonic scale.
 * Clearing four tasks in a row produces a rising phrase, which is physically
 * pleasant in a way four identical beeps is not. Pentatonic means any subset of
 * notes in any order is consonant — no sequence of completions sounds wrong.
 *
 * See docs/08-satisfaction.md § 8.2. Keep it quiet: the tone should sit under a
 * conversation, not interrupt one. Someone has to be able to run this in an
 * open office.
 */

let ctx: AudioContext | null = null;
let enabled = true;
let step = 0;
let lastAt = 0;

export const ROOT = 523.25;                              // C5
export const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // major pentatonic, two octaves
const RESET_MS = 20_000;
const GAIN = 0.09;                                        // deliberately low

/**
 * Reopening a task, in semitones from the root.
 *
 * § 8.2 asks for two things in one sentence: « a fifth below the root, never
 * part of the run ». This was -5, which is neither. A fifth below C5 is F4,
 * seven semitones down; -5 is G4, a *fourth* below — and G is degree 7 of the
 * scale above, so the tone meant to sound unlike a completion was a completion
 * note moved down an octave.
 *
 * Consonant, which is why it never sounded wrong and never got noticed. But the
 * point of this tone is to be outside the vocabulary the run is built from, so
 * that reopening reads as a different kind of event rather than a quieter
 * version of the same one. F is the one degree major pentatonic leaves out,
 * which is exactly why the specification asked for it.
 */
export const UNCHECK_SEMITONES = -7;

/** Call from the user's settings on hydration and on toggle. */
export function setSoundEnabled(value: boolean) {
  enabled = value;
}

export function isSoundEnabled() {
  return enabled;
}

/**
 * Browsers block AudioContext construction outside a user gesture, so build it
 * lazily on the first completion rather than at module load.
 */
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, duration = 0.18, gain = GAIN) {
  const ac = audio();
  if (!ac) return;

  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const amp = ac.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;

  // exponential envelope — a linear one clicks at the tail
  amp.gain.setValueAtTime(0.0001, now);
  amp.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(amp).connect(ac.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

/** Fires at 0ms on completion, before any network call. */
export function completionTone() {
  if (!enabled) return;

  const now = Date.now();
  step = now - lastAt < RESET_MS ? Math.min(step + 1, SCALE.length - 1) : 0;
  lastAt = now;

  tone(ROOT * Math.pow(2, SCALE[step] / 12));
}

/** Reopening a task. A fifth below the root, never part of the run. */
export function uncompleteTone() {
  if (!enabled) return;
  tone(ROOT * Math.pow(2, UNCHECK_SEMITONES / 12), 0.14, GAIN * 0.7);
}

/** Haptic companion. navigator.vibrate does not exist on iOS Safari. */
export function tick() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(8);
    } catch {
      /* no-op */
    }
  }
}
