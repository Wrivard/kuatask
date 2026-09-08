# 01 — Stack and setup

## Locked stack

No substitutions. No extra dependencies. If something seems missing, raise it rather than installing it.

| Layer | Choice | Why it's this |
|---|---|---|
| Framework | Next.js 15, App Router, TypeScript strict | Owner's standard |
| UI | shadcn/ui + Tailwind CSS v4 | Owner's standard; components are owned, not imported |
| Motion | `motion` v12+ (`motion/react`) | Layout animations and springs |
| Backend | Supabase — **`ca-central-1`** | Law 25 data residency |
| State | `zustand` | The optimistic store needs to be readable outside React |
| Dates | `date-fns` v4 + `@date-fns/tz` | Timezone-correct without pulling in moment |
| Icons | `lucide-react` | Ships with shadcn |
| Palette | `cmdk` | Ships with shadcn |
| Toasts | `sonner` | Ships with shadcn |
| Fonts | `geist` | Geist Sans + Geist Mono, the Vercel typeface |
| Hosting | Vercel | Owner's standard |

## Initialize

```bash
npx create-next-app@latest kua-tasks --typescript --tailwind --app --eslint --src-dir=false
cd kua-tasks

npx shadcn@latest init

npx shadcn@latest add button dialog input textarea select popover calendar \
  command checkbox avatar badge tooltip sonner dropdown-menu separator \
  scroll-area sheet switch tabs

npm i @supabase/supabase-js @supabase/ssr motion zustand \
  date-fns @date-fns/tz geist lucide-react
```

## Supabase project

Create the project **in `ca-central-1`**. This is not optional — the agency serves Quebec clients under Law 25 and data residency is part of how they sell.

Enable email auth. Disable email confirmations for signup (invites carry their own token). Set the site URL and redirect URLs for both `http://localhost:3000` and the production domain.

Apply `supabase/migrations/0001_init.sql` in the SQL editor or via the CLI. Then seed as described in `docs/02-data-model.md` — you will need the two work email addresses, which you must ask for.

## Environment

`.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. It is imported in exactly one place: the invite server action. Never in a file that has `'use client'` anywhere in its import graph. Before shipping, grep the client bundle to confirm it does not appear.

Mirror all four into Vercel project settings, with `NEXT_PUBLIC_SITE_URL` set to the production domain.

## Fonts

```tsx
// app/layout.tsx
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

<html lang="fr-CA" className={`${GeistSans.variable} ${GeistMono.variable}`}>
```

`lang="fr-CA"` matters for screen readers and for the browser's own date inputs.

## TypeScript

`strict: true`. No `any` in committed code. Generate database types once the schema is applied:

```bash
npx supabase gen types typescript --project-id <id> > lib/database.types.ts
```

Regenerate after any migration. The store and every query are typed against this file.
