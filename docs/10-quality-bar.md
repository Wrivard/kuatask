# 10 — Quality bar

Non-negotiable before the build is done. Check continuously, not only in Phase 6.

## Accessibility

- **Keyboard operable end to end.** Create, assign, date, complete, undo, navigate, all without a mouse.
- **Visible focus on everything focusable.** 1px accent ring, 2px offset. Never `outline: none` without a replacement.
- The checkbox is a real `<button role="checkbox">` with `aria-checked`, not a styled div. It announces the task title.
- Completion announces to screen readers via a polite live region: `{titre} terminé`.
- `prefers-reduced-motion` fully honoured — transforms become opacity crossfades, the clear-out sweep is skipped, every state change stays legible.
- Sound is **not** tied to the motion preference.
- Contrast: body text ≥ 4.5:1, large text and UI borders ≥ 3:1, in both themes. `--color-fg-faint` on `--color-bg` is the one to verify.
- `lang="fr-CA"` on the html element.
- The modal traps focus and returns it to the originating row on close.

## Mobile

First-class, not an afterthought. These people check the list in the evening on a phone.

- Bottom bar navigation, 52px row height, 44px minimum tap target everywhere
- No hover-dependent affordance anywhere in the app
- Safe-area insets respected on notched devices — the bottom bar cannot sit under the home indicator
- The composer works with the software keyboard open, and the keyboard does not cover it
- Long-press drag on the calendar tested on a real device, not a simulator
- `navigator.vibrate` guarded — it does not exist on iOS Safari and must not throw

## Performance

| Metric | Budget |
|---|---|
| Cold load to interactive, 4G | < 1.2s |
| View switch | 0 network requests, 0 layout shift |
| Click to first visual change | same frame |
| App route bundle | < 200KB gzipped |
| CLS | < 0.05 |

The calendar is hand-built specifically to stay inside the bundle budget. If you find yourself reaching for a date-picker library for the month grid, reread `docs/06-views.md`.

## Security

- `SUPABASE_SERVICE_ROLE_KEY` never reaches the client. **Grep the production bundle to confirm** — do not assume.
- RLS on every table, verified by querying as a non-member and getting empty sets.
- The invite server action verifies the caller is an admin server-side. Never trust a client-supplied role.
- No secrets in `NEXT_PUBLIC_*` beyond the URL and anon key.
- Session refresh in middleware, `httpOnly` cookies.

## Code

- TypeScript strict passes, no `any` in committed code
- No console errors or warnings in normal operation
- Database types generated from the live schema, regenerated after every migration
- Every user-facing string in `lib/copy.ts`
- All date logic in `lib/time.ts` — grep for `new Date()` outside that file and justify each one

## Both themes

Light and dark both finished. No unstyled flash on load — set the theme class before first paint with a blocking inline script. Verify every surface, border, and disabled state in both.
