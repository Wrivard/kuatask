# Küa Tasks

Shared task manager for two people. Next.js 15 + Supabase + shadcn/ui, deployed on Vercel.

## What's in here

This folder is the complete build specification. Hand it to Claude Code and it has everything it needs.

```
CLAUDE.md                    agent entry point — start here
docs/                        13 specification documents
reference/                   working code for the tricky parts
supabase/migrations/         the schema, ready to apply
```

## Handing it to Claude Code

```bash
mkdir kua-tasks && cd kua-tasks
cp -r /path/to/kua-tasks-docs/* .
claude
```

Then: `Read CLAUDE.md and start Phase 1.`

Claude Code picks up `CLAUDE.md` automatically as project context, so it stays loaded across the whole build.

## Before you start

Have these ready — the agent will ask, and shouldn't invent them:

- The two work email addresses (they become the admin accounts)
- A Supabase project in **ca-central-1** (Law 25), with its URL, anon key, and service role key

## The one thing that matters

Everything in `docs/08-satisfaction.md`. The app is a habit tool. If checking off a task doesn't feel good, none of the rest counts.
