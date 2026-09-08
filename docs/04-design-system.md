# 04 — Design system

## Direction

The brief names two references and they win over any other instinct: **Vercel** for structure, restraint and typography; **Supabase** for the green and the warmth in the dark surfaces.

What that means concretely: near-black surfaces, hairline borders instead of shadows, one reserved accent colour, a tight neutral ramp, Geist, small radii, and almost no decoration. The interface should look like a developer tool, because the two people using it are developers and that is the register they trust.

Dark is the default. Light mode is supported and must be equally finished — not a filter over the dark tokens.

## Colour

```css
/* app/globals.css — Tailwind v4 */
@theme {
  --color-bg:            #0A0A0A;
  --color-surface:       #111111;
  --color-surface-hover: #161616;
  --color-border:        #232323;
  --color-border-strong: #2E2E2E;
  --color-fg:            #EDEDED;
  --color-fg-muted:      #8F8F8F;
  --color-fg-faint:      #5A5A5A;
  --color-accent:        #3ECF8E;
  --color-accent-dim:    #1F6E4C;
  --color-danger:        #F45B5B;
}

.light {
  --color-bg:            #FFFFFF;
  --color-surface:       #FAFAFA;
  --color-surface-hover: #F4F4F4;
  --color-border:        #EAEAEA;
  --color-border-strong: #D8D8D8;
  --color-fg:            #0A0A0A;
  --color-fg-muted:      #666666;
  --color-fg-faint:      #999999;
  --color-accent:        #1F9D63;   /* darkened for contrast on white */
  --color-accent-dim:    #A8E5C8;
  --color-danger:        #D93636;
}
```

### Rules

**Separation comes from 1px hairline borders, never drop shadows.** One exception: the task modal gets a single soft shadow so it reads as floating above the page. Nothing else in the app has a shadow.

**Accent green is reserved.** It marks three things and nothing else: a completed state, the focus ring, and today's marker in the calendar. It is never a card background, never a gradient, never decorative. Its scarcity is what makes a completion register.

**Identity dots are the only other colour.** Each user picks an accent stored in `profiles.accent`. It appears as a 6px dot next to assigned tasks. Keep the palette to six options, all legible on both themes.

**One border-radius per role**, not one for everything: `6px` on inputs and buttons, `8px` on task rows, `10px` on the modal.

## Typography

Geist Sans throughout. Geist Mono only where tabular figures matter: calendar numerals, counts, the remaining-tasks number beside the progress ring. Mono is a data treatment here, not a style choice — do not use it for labels.

```
Task title         15px / 400 / -0.011em / 1.4     the workhorse
Section header     13px / 500 / fg-muted
Metadata           12px / 400 / fg-faint
Page title         22px / 600 / -0.02em
Composer input     15px / 400                      matches task title exactly
Calendar numeral   12px Geist Mono / tabular-nums
Button             14px / 500
```

The task title is the one to get right. It is 90% of the pixels a user reads. Test it at 15px before assuming.

### Typographic bans

- No all-caps labels
- No eyebrow text above headings
- No meta strings joined with middle dots
- No arrows appended to button text
- Sentence case everywhere, including buttons and section headers

## Space and shape

4px base scale. Task row height **44px desktop, 52px touch**. Sidebar 220px. List content column maxes at 760px and is left-aligned in the available space, not centred — a centred column in a tool reads as a document.

Rows sit directly on `--color-bg` with a 1px `--color-border` divider between them, not as separate cards. A list of cards fragments the scan; a list of rows reads as one list.

## Motion contract

```ts
// reference/motion.ts
export const spring = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 };
export const snap   = { duration: 0.16, ease: [0.32, 0.72, 0, 1] };
export const exit   = { duration: 0.22, ease: [0.4, 0, 1, 1] };
```

**Non-user-triggered animation is banned**, with exactly one exception: the clear-out moment in `docs/08-satisfaction.md`. No entrance animations on page load, no staggered section reveals, no hover transitions on every row. Those read as generated and they get tiring by day three.

Motion that answers an action is welcome and expected — it shows what changed. Nothing user-triggered lasts longer than **260ms**.

### Reduced motion

`prefers-reduced-motion: reduce` replaces every transform and scale with an opacity crossfade. Every state change stays legible. The completion sound is **not** disabled by reduced motion — they are unrelated preferences, and sound is the accessible channel for a user who has turned off animation.

## Icons

`lucide-react`, 16px in rows and buttons, 18px in the sidebar, `stroke-width: 1.5`. Icons never appear alone in a destructive action — delete is a labelled item in the modal footer, not a naked trash can.

## Focus

Every focusable element gets a visible focus ring: `1px solid var(--color-accent)` with a 2px offset. Never `outline: none` without a replacement. Keyboard navigation is a primary input method here, not a fallback — see `docs/07-keyboard.md`.
