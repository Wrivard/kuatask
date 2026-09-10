/**
 * Database invariant suite for Küa Tasks.
 *
 *   node scripts/verify-db.mjs            # against .env.local
 *   node scripts/verify-db.mjs .env.prod  # against another environment
 *
 * Checks the guarantees the app depends on but cannot assert about itself: RLS,
 * the signup and completion triggers, the last-admin guard, and realtime
 * delivery. Every one of these was, at some point, quietly wrong — the realtime
 * DELETE and the timezone bug both survived typecheck, lint and a clean build.
 *
 * It creates throwaway users and tasks and deletes them afterwards, then
 * verifies the cleanup rather than assuming it: an earlier version of this
 * script reported success while leaving two rows behind.
 *
 * SAFETY: cleanup only ever deletes ids this run created. It must never delete
 * "whatever is left over" — during this build a leftover row was assumed to be
 * test residue and removed, and it turned out to be a real task somebody had
 * just typed. Counting strays is a check; deleting them is not this script's
 * business. Run it against a project you are willing to write to.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = process.argv[2] ?? ".env.local";
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_ || !ANON || !SR) {
  console.error(`missing Supabase keys in ${envPath}`);
  process.exit(2);
}

const admin = createClient(URL_, SR, { auth: { persistSession: false } });
const stamp = Date.now();
const PW = `Verify-${stamp}-aA1!`;

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const section = (name) => console.log(`\n${name}`);

/** Creates an invited, signed-in throwaway member. */
async function makeMember(workspaceId, role, tag) {
  const email = `kua-verify-${tag}-${stamp}@example.com`;
  const { data: invite } = await admin
    .from("pending_invites")
    .insert({ workspace_id: workspaceId, email, role })
    .select("id")
    .single();

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw error;

  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: PW });
  return { id: created.user.id, email, client, inviteId: invite?.id };
}

const created = { tasks: [], users: [], invites: [], workspace: null };

/*
  A workspace to run against.

  Both live suites used to open with `.select("id").limit(1).single()`, which
  throws on an empty database — so they could only ever be pointed at a project
  somebody had already used by hand. That is the wrong way round: the run worth
  trusting most is the one against a database with nothing in it, because that
  is where a missing default or an unapplied migration shows up.

  If one exists it is borrowed and left exactly as found. If none does, one is
  created here and torn down at the end, along with everything in it — the same
  rule as every other id in this file: nothing deletes what it did not create.
*/
async function workspaceToUse() {
  const { data: existing } = await admin
    .from("workspaces")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id, ours: false };

  const { data, error } = await admin
    .from("workspaces")
    .insert({ name: `verify-${stamp}` })
    .select("id")
    .single();
  if (error) throw new Error(`could not create a workspace: ${error.message}`);
  console.log(`  (empty database — created workspace ${data.id} for this run)`);
  return { id: data.id, ours: true };
}


try {
  const workspace = await workspaceToUse();
  const WS = workspace.id;
  if (workspace.ours) created.workspace = WS;

  /*
    A workspace this run made has nobody in it, so the last-admin guard would be
    skipped for want of an admin to try to remove. One is made here so the check
    that matters most on a fresh database actually runs.
  */
  if (workspace.ours) {
    const seedAdmin = await makeMember(WS, "admin", "seed");
    created.users.push(seedAdmin.id);
  }

  // ---------------------------------------------------------------- RLS
  section("RLS — an uninvited caller sees nothing, and sees it as an empty set");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  for (const table of ["tasks", "workspaces", "profiles", "workspace_members", "pending_invites"]) {
    const { data, error } = await anon.from(table).select("*");
    check(
      `anon read of ${table} returns []`,
      !error && Array.isArray(data) && data.length === 0,
      error?.message ?? `${data?.length} rows`,
    );
  }

  // ------------------------------------------------------ signup trigger
  section("Signup trigger — an invite becomes a membership");
  const member = await makeMember(WS, "member", "m");
  created.users.push(member.id);
  created.invites.push(member.inviteId);

  const { data: profile } = await admin.from("profiles").select("id").eq("id", member.id);
  check("profile created", profile?.length === 1);

  const { data: membership } = await admin
    .from("workspace_members")
    .select("role")
    .eq("user_id", member.id);
  check("membership created with the invited role", membership?.[0]?.role === "member");

  const { data: leftover } = await admin
    .from("pending_invites")
    .select("id")
    .eq("id", member.inviteId);
  check("invite consumed", leftover?.length === 0);
  if (leftover?.length === 0) created.invites.pop();

  // -------------------------------------------------- completion trigger
  section("Completion trigger — the server owns completed_at and completed_by");
  const { data: task, error: insErr } = await member.client
    .from("tasks")
    .insert({ workspace_id: WS, title: "verify probe", created_by: member.id, due_on: "2026-09-08" })
    .select()
    .single();
  check("member can insert a task", !insErr, insErr?.message ?? "ok");
  if (task) created.tasks.push(task.id);

  check("due_on round-trips as a bare calendar day", task?.due_on === "2026-09-08", String(task?.due_on));

  const spoof = await member.client
    .from("tasks")
    .insert({ workspace_id: WS, title: "spoof", created_by: "00000000-0000-0000-0000-000000000000" });
  check("insert with someone else's created_by refused", Boolean(spoof.error));

  const { data: done } = await member.client
    .from("tasks")
    .update({ status: "done", completed_at: null, completed_by: null })
    .eq("id", task.id)
    .select()
    .single();
  check("done stamps completed_at even when the client sends null", Boolean(done?.completed_at));
  check("done stamps completed_by from auth.uid()", done?.completed_by === member.id);

  const { data: doing } = await member.client
    .from("tasks").update({ status: "doing" }).eq("id", task.id).select().single();
  check("leaving done clears the stamp", doing?.completed_at === null && doing?.completed_by === null);

  const { data: redone } = await member.client
    .from("tasks").update({ status: "done" }).eq("id", task.id).select().single();
  check("doing -> done stamps again", Boolean(redone?.completed_at));

  // ---------------------------------------------------- last-admin guard
  section("Last-admin guard — enforced in the database, not the UI");
  const { data: admins } = await admin
    .from("workspace_members").select("user_id").eq("workspace_id", WS).eq("role", "admin");

  if (admins.length === 1) {
    const sole = admins[0].user_id;
    const del = await admin.from("workspace_members").delete()
      .eq("workspace_id", WS).eq("user_id", sole);
    check("deleting the only admin is refused", Boolean(del.error), del.error?.message?.slice(0, 48));

    const dem = await admin.from("workspace_members").update({ role: "member" })
      .eq("workspace_id", WS).eq("user_id", sole);
    check("demoting the only admin is refused", Boolean(dem.error), dem.error?.message?.slice(0, 48));

    const { data: still } = await admin.from("workspace_members")
      .select("role").eq("user_id", sole);
    check("the admin is untouched afterwards", still?.[0]?.role === "admin");
  } else {
    check(`skipped: workspace has ${admins.length} admins, not 1`, true);
  }

  // --------------------------------------------------------- realtime
  section("Realtime — all three event types reach a member's own channel");
  const seen = [];
  const channel = member.client
    .channel(`verify:${WS}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "tasks", filter: `workspace_id=eq.${WS}` },
      (payload) => seen.push(payload.eventType),
    );

  const subscribed = await new Promise((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(false);
    });
    setTimeout(() => resolve(false), 15000);
  });
  check("channel subscribed", subscribed);

  if (subscribed) {
    // replication needs a moment after SUBSCRIBED, or the first write is missed
    await new Promise((r) => setTimeout(r, 3000));

    const { data: rt } = await admin.from("tasks")
      .insert({ workspace_id: WS, title: "realtime probe", created_by: member.id })
      .select().single();
    created.tasks.push(rt.id);
    await new Promise((r) => setTimeout(r, 3500));

    await admin.from("tasks").update({ status: "done" }).eq("id", rt.id);
    await new Promise((r) => setTimeout(r, 3500));

    await admin.from("tasks").delete().eq("id", rt.id);
    await new Promise((r) => setTimeout(r, 5000));
    created.tasks = created.tasks.filter((id) => id !== rt.id);

    check("INSERT delivered", seen.includes("INSERT"));
    check("UPDATE delivered", seen.includes("UPDATE"));
    // needs replica identity full — see migration 0003
    check("DELETE delivered", seen.includes("DELETE"), seen.join(" -> "));
  }
  await channel.unsubscribe();

  /*
    Identity is the only shared state that is not a task. It needs its own line
    in the publication (migration 0008) and there is nothing in the app that
    would fail loudly without it — a rename would simply never arrive, and the
    other person's board would keep a column labelled with a name that no longer
    exists until they reloaded.
  */
  section("Realtime — a profile change reaches a member too");
  const profileSeen = [];
  const profileChannel = member.client
    .channel(`verify-profile:${stamp}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      (payload) => profileSeen.push(payload.new?.display_name),
    );

  const profileUp = await new Promise((resolve) => {
    profileChannel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") resolve(false);
    });
    setTimeout(() => resolve(false), 15000);
  });
  check("profile channel subscribed", profileUp);

  if (profileUp) {
    await new Promise((r) => setTimeout(r, 3000));
    const renamed = `verify-${stamp}`;
    await admin.from("profiles").update({ display_name: renamed }).eq("id", member.id);
    await new Promise((r) => setTimeout(r, 4000));
    check("a rename is delivered", profileSeen.includes(renamed),
          profileSeen.join(", ") || "nothing arrived — is profiles in the publication?");
  }
  await profileChannel.unsubscribe();
} catch (err) {
  console.log(`\n  ERROR  ${err.message}`);
  failures += 1;
} finally {
  section("Cleanup — verified, not assumed");
  for (const id of created.tasks) await admin.from("tasks").delete().eq("id", id);
  for (const id of created.invites) if (id) await admin.from("pending_invites").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  // only ever a workspace this run created; a borrowed one is left untouched
  if (created.workspace) {
    await admin.from("workspace_members").delete().eq("workspace_id", created.workspace);
    await admin.from("workspaces").delete().eq("id", created.workspace);
  }

  const { data: users } = await admin.auth.admin.listUsers();
  const stray = users.users.filter((u) => u.email?.startsWith("kua-verify-"));
  const { data: strayTasks } = await admin.from("tasks").select("id,title").ilike("title", "%probe%");
  const { data: strayInvites } = await admin.from("pending_invites").select("email").ilike("email", "kua-verify-%");

  check("no throwaway users left behind", stray.length === 0, stray.map((u) => u.email).join(", "));
  check("no probe tasks left behind", (strayTasks?.length ?? 0) === 0);
  check("no throwaway invites left behind", (strayInvites?.length ?? 0) === 0);

  console.log(`\n${failures === 0 ? "all invariants hold" : `${failures} FAILED`}`);
  process.exit(failures ? 1 : 0);
}
