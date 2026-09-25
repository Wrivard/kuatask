import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { StoreBoot } from "@/components/shell/store-boot";
import { AppChrome } from "@/components/shell/app-chrome";
import { BottomBar } from "@/components/shell/bottom-bar";
import { LiveRegion } from "@/components/shell/live-region";
import { SetupRequired } from "@/components/shell/setup-required";
import { Unreachable } from "@/components/shell/unreachable";
import { PreviewBanner } from "@/components/shell/preview-banner";
import { recentCompletionCutoff } from "@/lib/time";
import { isTransportFailure } from "@/lib/errors";
import { copy } from "@/lib/copy";

// per-user by definition: never prerender
export const dynamic = "force-dynamic";

/**
 * The app shell: the store's initial data, the keyboard layer, and the frame.
 *
 * The workspace query has to happen here anyway to decide between the app and
 * /no-access, so the tasks and profiles come back in the same round trip and are
 * handed to the store before first paint. That removes the cold-load sequence of
 * JS, hydrate, auth, query — and with it the skeleton.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // a misconfigured deploy should explain itself rather than emit a digest
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS means membership decides all three of these, not the query
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) redirect("/no-access");

  /*
    Completed tasks used to be fetched for ever: the UI only ever shows today's,
    but every one ever finished still crossed the wire on each load, so the app
    got slower the longer it was used. Only the last few days are needed for the
    footer and the hold, and the streak needs one bit per day rather than whole
    rows — so it gets its own thin query of timestamps.
  */
  const recent = recentCompletionCutoff();

  const [
    { data: workspace },
    { data: tasks, error: tasksError },
    { data: members },
    { data: completions },
    { data: subtasks },
  ] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", membership.workspace_id)
      .or(`status.neq.done,completed_at.gte.${recent}`)
      .order("position"),
    supabase.from("profiles").select("*"),
    /*
      Distinct days, computed in Postgres. This used to select `completed_at`
      for every completed task in the workspace and reduce it to a set here —
      unbounded, on every page load, to answer a question whose result is at
      most a few hundred dates. Worse, PostgREST caps rows and the query had no
      ordering, so past that cap the streak would have been computed from an
      arbitrary subset with nothing to say it had gone wrong.
    */
    supabase.rpc("completion_days"),
    /*
      Every checklist row the workspace can see. RLS scopes it through the
      tasks, and the whole set is a few hundred short rows at most — the list
      shows « 2/5 » on the row itself, and a count that arrives after the row
      has drawn is a row that moves under your eyes.
    */
    supabase.from("subtasks").select("*"),
  ]);

  /*
    A failed query is not an empty workspace.

    Without this the shell fell through to `tasks ?? []` and rendered « Rien
    encore. Ajoute ta première tâche. » to somebody who has forty — an empty
    state and a failed read look identical from the inside and mean opposite
    things, and the wrong one of the two invites you to type your work in again.

    Only the tasks query is checked. The others degrade into something honest on
    their own: no workspace name is a blank heading, no profiles is a board
    without colours. An empty task list is the one that actively lies.

    Measured which case this actually covers, rather than assuming. A project
    that is fully asleep fails `getUser()` too, so the visit is redirected to
    /login and the message there does the explaining. This is the narrower
    split-brain: auth answering while PostgREST does not, which they can do
    independently because they are separate services. Narrower, still real, and
    the only version of it where somebody is looking at their own workspace
    being described as empty.
  */
  /*
    One retry before giving up, on a failure that looks like transport.

    Every write in the app already does this — `withRetry` in the store exists
    because a phone changing cell towers is routine and a single blip should not
    become a rollback. The first load was the one request with no such guard, so
    one dropped fetch took the entire app to a full-page error that tells you to
    go and wake a project which, in the case that prompted this, was running
    perfectly the whole time.

    Only transport failures. A refusal carries a SQLSTATE — that is the database
    saying no, and asking again immediately helps nobody.
  */
  let failure = tasksError;
  let rows = tasks;

  if (failure && isTransportFailure(failure)) {
    await new Promise((r) => setTimeout(r, 400));
    const retry = await supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", membership.workspace_id)
      .or(`status.neq.done,completed_at.gte.${recent}`)
      .order("position");
    failure = retry.error;
    rows = retry.data;
  }

  if (failure) return <Unreachable code={failure.code ?? null} />;

  // already distinct, already Montreal days, already newest first
  const completionDays = (completions ?? []) as string[];

  if (!workspace) redirect("/no-access");

  return (
    /*
      The banner is a row above the app rather than an overlay inside it: a
      preview writes to the real database, and that is a fact about the whole
      window, not a notice to dismiss. It renders to nothing in production.
    */
    <div className="flex min-h-dvh flex-col">
      <PreviewBanner />
      <div className="flex min-h-0 flex-1">
        <StoreBoot
          initial={{
            // `rows`, not `tasks` — the retry above may be the attempt that worked
            tasks: rows ?? [],
            subtasks: subtasks ?? [],
            members: members ?? [],
            me: members?.find((m) => m.id === user.id) ?? null,
            workspaceId: membership.workspace_id,
            completionDays,
            /*
            The one `new Date()` that has to be raw. It is the server's own
            instant, and it is what lib/time.ts calibrates against — asking
            that file for it would be asking the corrected clock to correct
            itself. docs/10 wants each of these justified; this is the root.
          */
          serverNow: new Date().toISOString(),
          }}
        />
        {/*
        First in the tab order, invisible until focused. Without it, reaching a
        task by keyboard means tabbing through the sidebar's nav, the filter and
        the streak on every single page load.
      */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-sm focus:border focus:border-control focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:text-fg"
        >
          {copy.a11y.skipToContent}
        </a>
        <AppChrome />
        <LiveRegion />
        <Sidebar workspaceName={workspace.name} />
        {/* the pad clears the fixed mobile bar plus the home indicator */}
        <main
          id="main"
          // -1 so the skip link can move focus here; not in the tab order itself
          tabIndex={-1}
          className="min-w-0 flex-1 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
        >
          {children}
        </main>
        <BottomBar />
      </div>
    </div>
  );
}
