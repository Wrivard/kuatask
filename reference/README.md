# Reference files

Working code for the parts that are easy to get subtly wrong. Copy into `lib/`, fix the imports, and adapt. Do not rewrite from scratch.

| File | Goes to | Why it's here |
|---|---|---|
| `time.ts` | `lib/time.ts` | Montreal day buckets. Every "today" bug in this app comes from doing this ad hoc. |
| `sound.ts` | `lib/sound.ts` | The rising pentatonic run. The single most effective mechanic in the app. |
| `motion.ts` | `lib/motion.ts` | Animation tokens plus the completion timings from § 8.1. |
| `parse-fr.ts` | `lib/parse-fr.ts` | French date/assignee/label parsing for the composer. Tedious to write, easy to get wrong. |
| `store.ts` | `lib/store.ts` | Optimistic store, undo stack, local-precedence reconciliation. |
| `realtime.ts` | `lib/realtime.ts` | Channel wiring. Mount once in the shell after hydration. |

## Notes

**`store.ts` assumes `lib/database.types.ts` exists.** Generate it after applying the migration:

```bash
npx supabase gen types typescript --project-id <id> > lib/database.types.ts
```

**`parse-fr.ts` needs test coverage.** These strings must all resolve correctly:

```
"rappeler le fournisseur demain 14h"
"envoyer les maquettes @guillaume #acme vendredi"
"renouveler le domaine dans 3 jours !"
"appeler le comptable lundi prochain"
"préparer la soumission 15 mars"
"faire le suivi 15/03"
"demain"                    -> title stays "demain", no date
```

The last one is the guard against stripping a title down to nothing.

**`sound.ts` builds its AudioContext lazily** on the first completion, because browsers block construction outside a user gesture. Do not move it to module scope.
