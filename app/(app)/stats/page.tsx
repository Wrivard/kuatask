import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/shell/header";
import { Unreachable } from "@/components/shell/unreachable";
import { StatsClient, type PersonStats } from "./stats-client";
import { copy } from "@/lib/copy";

// counts move whenever anybody finishes anything: never prerender
export const dynamic = "force-dynamic";

/**
 * Who has done what.
 *
 * Asked for directly, and worth recording that it runs against the grain of
 * `docs/08`: § 8.3 calls the progress ring "the only piece of persistent state
 * feedback" and says not to add a second, § 8.5 rules out badges and trophies,
 * and § 8.6 warns that a streak which pressures you is one you eventually
 * resent. Those rules are about the *list* — the surface you work in all day —
 * and they still hold there: nothing on this page appears anywhere else, and
 * you have to come and look for it.
 *
 * Which is also why it is numbers rather than medals. Two people comparing
 * micro-tasks is only fun while it stays information.
 */
export default async function StatsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rows, error: statsError }, { data: profiles }] = await Promise.all([
    supabase.rpc("person_stats"),
    supabase.from("profiles").select("id, display_name, accent, avatar_url"),
  ]);

  /*
    A failed read is not a quiet week.

    Without this the page falls through to zero for everybody, which is a
    perfectly plausible number — nobody finished anything today is a real state —
    so a broken query would render as a true-looking fact. The shell carries the
    same guard for the task list and the same reasoning: an empty result and a
    failed one look identical from the inside and mean opposite things.
  */
  if (statsError) return <Unreachable code={statsError.code ?? null} />;

  /*
    Everybody appears, including whoever has finished nothing. `person_stats`
    groups over completions, so a person with none is simply absent from it —
    and a leaderboard that omits the person in last place is not reporting, it
    is editorialising.
  */
  const byUser = new Map((rows ?? []).map((r) => [r.user_id, r]));

  const people: PersonStats[] = (profiles ?? []).map((p) => {
    const row = byUser.get(p.id);
    return {
      id: p.id,
      displayName: p.display_name,
      accent: p.accent,
      avatarUrl: p.avatar_url,
      today: row?.done_today ?? 0,
      week: row?.done_week ?? 0,
      month: row?.done_month ?? 0,
      total: row?.done_total ?? 0,
      days: row?.days ?? [],
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title={copy.nav.stats} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <StatsClient people={people} me={user.id} />
      </div>
    </div>
  );
}
