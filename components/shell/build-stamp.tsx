import { copy } from "@/lib/copy";

/**
 * Which build you are looking at.
 *
 * Added after half an hour was spent establishing that a deploy had in fact
 * gone out — the code was live, the person was on the login screen, and there
 * was no way from inside the app to tell those two situations apart. A commit
 * and a date answer it in one glance, and cost nothing to carry.
 *
 * Server component, read from Vercel's own build-time environment. Locally
 * there is no commit, so it says so rather than showing a blank or a guess.
 */
export function BuildStamp() {
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);
  const builtAt = process.env.VERCEL_DEPLOYMENT_ID ? deployedOn() : null;

  return (
    <p className="font-mono text-[12px] tabular-nums text-fg-faint">
      {commit ? `${commit}${builtAt ? ` · ${builtAt}` : ""}` : copy.settings.localBuild}
    </p>
  );
}

/**
 * The day this build was made, in Montreal.
 *
 * Not `lib/time.ts`: this runs once at build time on a server that is not in
 * Montreal, and it describes the deploy rather than a task. Everything about a
 * *task's* day still goes through that file.
 */
function deployedOn(): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Montreal",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}
