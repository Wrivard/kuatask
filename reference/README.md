# Reference files

**These are the originals, as delivered. `lib/` is what runs.**

They were the starting point for the parts that are easy to get subtly wrong,
copied into `lib/` in Phase 1 and adapted from there. They are kept for
provenance — so it is possible to see what was given versus what was decided —
and they are **not** maintained. Every one of them has since diverged, several
of them substantially:

| File | Then | Now | What happened |
|---|---:|---:|---|
| `time.ts` | 166 | 385 | Day-dependent helpers take the day as a parameter, so nothing reads the clock mid-render. `bucketOf` compares day strings against boundaries computed once per day instead of parsing dates per task, and `instantToDay` uses `Intl` behind a cache — together about 200× faster. Plus the clock offset from the server, so a wrong device clock cannot decide what day it is. |
| `store.ts` | 238 | 653 | Ref-counted `pending` with a timeout, undo entries carrying preconditions, retry on transport failure but not on refusal, no-op patch elision, server-seeded hydration, bounded completion window, archive search. |
| `realtime.ts` | 41 | 80 | Reconnect and resync on wake, and `DELETE` handling that needed a migration to work at all. |
| `parse-fr.ts` | 160 | 168 | Year rollover for numeric dates. |
| `sound.ts` | 95 | 98 | The uncheck interval. § 8.2 asks for « a fifth below the root, never part of the run »; the reference has -5 semitones, which is a fourth below and lands on G — a note the run itself uses. `lib/` has -7. |
| `motion.ts` | 51 | 52 | — |

If you are reading one of these to understand how something works, read the
`lib/` version instead. If you are wondering why something in `lib/` looks the
way it does, the diff against the file here is often the answer, and
`DECISIONS.md` usually has the reasoning.

Do not edit these. Do not import from them — `eslint.config.mjs` ignores this
directory precisely because it is not part of the build.
