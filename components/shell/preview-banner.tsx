import { copy } from "@/lib/copy";

/**
 * A preview deployment writes to the real database.
 *
 * There is one Supabase project, so every preview build points at the same
 * tables production does. Ticking something off in a preview to see whether the
 * animation feels right ticks it off for both of you, for real, and the two
 * screens are otherwise identical — same data, same colours, same everything.
 *
 * Giving previews their own database is the actual fix and it costs money the
 * organisation is not currently spending (`supabase/README.md`). Until then the
 * honest thing is to say so on the screen rather than to rely on remembering
 * which tab is which.
 *
 * Server component, read at render from Vercel's own environment: nothing ships
 * to the client on production, where the banner does not exist at all.
 */
export function PreviewBanner() {
  if (process.env.VERCEL_ENV !== "preview") return null;

  const branch = process.env.VERCEL_GIT_COMMIT_REF;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-danger/15 px-4 py-1.5 text-center text-[12px] text-fg"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
      {copy.preview.warning}
      {branch && <span className="font-mono text-fg-muted">{branch}</span>}
    </div>
  );
}
