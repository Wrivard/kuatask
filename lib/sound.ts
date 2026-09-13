/**
 * Completion tones, generated with the Web Audio API. No audio files.
 *
 * The mechanic: completions close together climb a pentatonic scale — see
 * RESET_MS below for how close, which is no longer the 20s § 8.2 starts from.
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
/*
  Tuned per § 8.9. 20s was the starting value and it is too short for the way
  these two actually clear a list: you tick one, read the next, decide, tick it.
  Thirty seconds keeps a run alive across that pause, and is still far below the
  point where an unrelated completion half a minute later would inherit a climb
  it did not earn.
*/
const RESET_MS = 30_000;
/*
  Tuned per § 8.9. 0.09 was the starting value and stays: under a conversation
  is the brief, and the tone is a sine at 180ms with an exponential tail, which
  carries further than its peak suggests. Louder was the wrong direction — what
  makes a run feel good is the interval climbing, not the volume.
*/
const GAIN = 0.09;

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
  /*
    Past the tenth note the run holds at the top rather than wrapping.

    § 8.2 says « up ten notes », and ten notes is what SCALE holds. Wrapping to
    the bottom would undo the one thing the mechanic is for — a phrase that
    rises — and climbing further leaves the register where a sine at this gain
    still sits under a conversation. Holding means an eleventh completion in one
    run repeats the top note, which is the least bad of the three.
  */
  step = now - lastAt < RESET_MS ? Math.min(step + 1, SCALE.length - 1) : 0;
  lastAt = now;

  tone(ROOT * Math.pow(2, SCALE[step] / 12));
}

/**
 * Reopening a task. A fifth below the root, never part of the run.
 *
 * Deliberately leaves `step` and `lastAt` alone, so reopening does not reset the
 * climb. § 8.2 asks for reopening to feel « neutral, not punitive », and sending
 * the next completion back to the root would be the punitive reading — you
 * corrected something and the app took your run away.
 *
 * It matters more since a click on the row completes it: an accidental
 * completion is easier to make now, and undoing one should cost nothing but the
 * two seconds it took.
 */
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
