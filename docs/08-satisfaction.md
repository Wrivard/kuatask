# 08 — The satisfaction layer

This is the primary specification. Everything else in this folder exists to make this possible.

Build it in Phase 5, budget real time for it, and tune it by using the app rather than by reading the spec. Nothing here is optional decoration.

## Why this is the priority

The app has no moat, no network effect and no lock-in. Two people will keep using it only if the act of using it is pleasant. Specifically: capture has to be nearly free, and **completion has to pay out**.

Every mechanic below is aimed at one thing — making the moment a task goes from todo to done into something the user would repeat voluntarily. That is a low bar for a novelty and a very high bar for something that has to survive month three.

## 8.1 The checkbox

An 18px rounded square, 1px `--color-border-strong` at rest, transparent fill.

On click, this exact sequence, **starting at 0ms with no network wait**:

| At | What |
|---|---|
| `0ms` | Scale springs `1 → 0.88 → 1.04 → 1` on the standard spring |
| `0ms` | Accent fill **wipes in from the bottom** over 140ms — a wipe, not a fade |
| `0ms` | Completion tone fires (8.2) |
| `0ms` | `navigator.vibrate(8)` on touch devices |
| `60ms` | Checkmark SVG path draws via `stroke-dashoffset` over 180ms, ease-out |

The checkmark **draws**, it does not appear. That distinction is most of the effect. A path with `stroke-dasharray` equal to its length, animating `stroke-dashoffset` from length to zero.

Simultaneously on the row: a strikethrough draws left to right — a `::after` pseudo-element with `transform: scaleX(0 → 1)`, `transform-origin: left`, 200ms — while opacity drops to `0.45`.

### The 900ms hold

**The completed row then stays in place for 900ms before leaving.**

Do not remove it instantly. The pause is where the satisfaction lives — you need a beat to see the thing you just finished sitting there, done. Removing it on the same frame reads as the task being deleted, not completed, and it robs the interaction of its entire payoff.

After the hold: the row collapses over 220ms (height and opacity together) into the `Terminé aujourd'hui` footer, and the surrounding rows close the gap on a layout spring. Use the `layout` prop on the motion list so the reflow is animated, never a jump.

900ms is a starting value. Tune it by feel during Phase 6. It is almost certainly between 700 and 1100.

### Unchecking

The whole sequence in reverse — the checkmark undraws, the fill wipes out downward, the strikethrough retracts — plus a single lower tone (8.2). Reopening a task should feel neutral, not punitive.

## 8.2 Sound

Tones generated with the Web Audio API. No audio files, no library. Implementation is in `reference/sound.ts` — copy it as-is.

The mechanic: **completions within 20 seconds of each other climb a pentatonic scale.** First task is C5, the next is a step up, and so on up ten notes. Twenty seconds of silence resets to the bottom.

This is the single most effective thing in the app. Clearing four tasks in a row produces a rising phrase, and a rising phrase is physically pleasant in a way that four identical beeps is not. The scale is pentatonic so that any subset of notes, in any order, is consonant — there is no sequence of completions that sounds wrong.

Keep it quiet. The `0.09` gain in the reference file is deliberate: the tone should sit *under* a conversation, not interrupt one. Somebody has to be able to run this in an open office.

- Sine wave, 180ms, exponential attack and decay. No square waves, no noise, nothing that reads as a game.
- Uncheck plays a single tone a fifth below the root, never part of the run.
- On by default. Toggleable in settings and in the command palette. Persisted to `profiles.sound_enabled`, so it follows the user across devices.
- **Not** disabled by `prefers-reduced-motion` — those are unrelated preferences, and sound is the accessible channel for someone who has turned animation off.
- Lazily construct the `AudioContext` on first user gesture. Browsers block it otherwise and you will get a console error on load.

## 8.3 Progress ring

Top right of the header: a 22px SVG ring showing today's completion for tasks assigned to you, with the remaining count beside it in Geist Mono.

`stroke-dashoffset` animates on the standard spring with every change, in both directions. At 100% the ring fills solid accent and the number is replaced by a checkmark.

It is the only piece of persistent state feedback in the interface — small, always visible, quietly demanding. Do not add a second one. Do not add a percentage label. Do not add a weekly version.

## 8.4 Undo

Sonner toast, bottom centre: `Terminé` with an `Annuler` action, 5 seconds.

Rapid completions **collapse into one toast**: `3 tâches terminées`, and undo restores all three. A stack of toasts during a fast clear-out is noise that fights the thing it is celebrating.

Undo is a satisfaction feature, not a safety feature. It removes the half-second of "wait, is that the right one" before checking something off, and that hesitation is exactly what stops a habit forming.

## 8.5 The clear-out

**The one orchestrated non-user-triggered moment in the entire app.** Everything else animates only in response to a direct action.

Trigger: the last task assigned to you and due today goes to done.

1. A single band of light — a narrow accent-tinted gradient at roughly 14% opacity — sweeps once down the list area over 600ms, then is gone.
2. The progress ring fills.
3. The list settles into a quiet state: today's completed count, the streak, and one line of copy.

Rotate through a handful of copy lines so it does not go stale by the second week. See `docs/09-copy-fr.md`.

### What not to do

No confetti. No modal. No badge. No trophy. No extra sound beyond the final completion tone. No "You're on fire!"

Restraint is what makes this land the twentieth time instead of becoming something to click past. The reference points are Vercel and Supabase, and neither of them would throw confetti at you.

With `prefers-reduced-motion`, skip the sweep and crossfade directly to the settled state.

## 8.6 Streak

Consecutive Montreal days with at least one completion, computed client-side from `completed_at`.

Shown as a small number in the sidebar footer and in the clear-out state. That is all.

- Never a notification
- Never a warning that it is about to break
- Never a fire emoji
- No milestone celebrations

Present, never nagging. A streak that pressures you is a streak you eventually resent and then abandon.

## 8.7 Cross-user completion

When the other person completes a task visible on your screen, the row plays the full completion animation with their identity dot pulsing once beside it. No tone — sound is reserved for your own actions.

Seeing your partner clear something in real time is the strongest social mechanic available in a two-person tool, and it is free once realtime is wired. Do not skip it.

## 8.8 The invisible requirements

These have no UI but the app does not feel right without them:

- **Zero latency on every action.** Optimistic everywhere. No spinner past first paint.
- **No layout shift when a row leaves.** The `layout` prop handles reflow.
- **The composer never loses focus while typing**, including when a realtime event arrives from the other user. A store update must not remount the input.
- **Scroll position survives view switches.**
- **Cold load to interactive under 1.2s on 4G.**
- **The first frame after a click is the changed frame.** Not the second, not after a microtask. Measure it if unsure.

## 8.9 Tuning pass

These four numbers cannot be specified correctly in advance. Set them by feel in Phase 6, after using the app for a full day:

| Value | Start at | Symptom if wrong |
|---|---|---|
| Row hold before collapse | 900ms | Too short reads as deletion; too long feels stuck |
| Tone gain | 0.09 | Too loud is embarrassing in public; too quiet is pointless |
| Scale reset window | 20s | Too short never builds a run; too long climbs during unrelated work |
| Checkmark draw duration | 180ms | Too fast is a pop; too slow is sluggish |

Write the final values into `DECISIONS.md` with a sentence on why, so they are not silently reverted later.
