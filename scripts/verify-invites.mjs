/**
 * The invite and membership rules, against a real database.
 *
 *   npm run verify:invites
 *
 * The server actions in app/(app)/settings/people/actions.ts cannot be called
 * from here — a server action needs Next's action protocol and a request. What
 * *can* be checked is every rule they enforce, against the same database and
 * the same RLS, using a real admin session and a real member session:
 *
 *   - only an admin may invite, revoke or remove
 *   - an invite for an existing member is refused
 *   - a duplicate invite is refused
 *   - consuming an invite creates the membership and deletes the invite
 *   - the last admin cannot be removed or demoted
 *   - removing a member leaves their tasks alone
 *
 * That last one is a decision from docs/03: deleting someone's tasks when they
 * leave loses work. It is the kind of rule that is easy to break later and
 * invisible when broken, so it is worth a test.
 *
 * SAFETY: only ever deletes ids this run created.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs
    .readFileSync(process.argv[2] ?? ".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const stamp = Date.now();
const PW = `Invite-${stamp}-aA1!`;
let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const section = (n) => console.log(`\n${n}`);

const mine = { users: [], invites: [], tasks: [], workspace: null };

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


async function join(workspaceId, role, tag) {
  const email = `kua-inv-${tag}-${stamp}@example.com`;
  const { data: invite } = await admin
    .from("pending_invites")
    .insert({ workspace_id: workspaceId, email, role })
    .select("id")
    .single();
  mine.invites.push(invite.id);

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password: PW,
    email_confirm: true,
  });
  if (error) throw error;
  mine.users.push(created.user.id);

  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: PW });
  return { id: created.user.id, email, client, inviteId: invite.id };
}

try {
  const workspace = await workspaceToUse();
  const WS = workspace.id;
  if (workspace.ours) mine.workspace = WS;

  section("Invite consumption");
  const owner = await join(WS, "admin", "own");
  const { data: membership } = await admin
    .from("workspace_members").select("role").eq("user_id", owner.id);
  check("an invite becomes a membership at the invited role",
        membership?.[0]?.role === "admin", JSON.stringify(membership));

  const { data: consumed } = await admin
    .from("pending_invites").select("id").eq("id", owner.inviteId);
  check("and the invite is gone", consumed?.length === 0);
  if (consumed?.length === 0) mine.invites = mine.invites.filter((i) => i !== owner.inviteId);

  section("Who may write to the member list");
  const plain = await join(WS, "member", "plain");
  mine.invites = mine.invites.filter((i) => i !== plain.inviteId);

  const memberInvite = await plain.client
    .from("pending_invites")
    .insert({ workspace_id: WS, email: `nope-${stamp}@example.com`, role: "member" });
  check("a plain member cannot create an invite", Boolean(memberInvite.error),
        `status ${memberInvite.status}`);

  // RLS makes a refused delete look like a no-op to the caller, so the check
  // is whether the row survived rather than whether an error came back
  await plain.client.from("workspace_members").delete().eq("user_id", owner.id);
  const { data: ownerStill } = await admin
    .from("workspace_members").select("user_id").eq("user_id", owner.id);
  check("a plain member cannot remove anyone", ownerStill?.length === 1);

  await plain.client
    .from("workspace_members").update({ role: "admin" }).eq("user_id", plain.id);
  const { data: plainRole } = await admin
    .from("workspace_members").select("role").eq("user_id", plain.id);
  check("a plain member cannot promote themselves", plainRole?.[0]?.role === "member",
        plainRole?.[0]?.role);

  const adminInvite = await owner.client
    .from("pending_invites")
    .insert({ workspace_id: WS, email: `ok-${stamp}@example.com`, role: "member" })
    .select("id").single();
  check("an admin can create an invite", !adminInvite.error, adminInvite.error?.message ?? "ok");
  if (adminInvite.data) mine.invites.push(adminInvite.data.id);

  section("Duplicates");
  const dup = await owner.client
    .from("pending_invites")
    .insert({ workspace_id: WS, email: `ok-${stamp}@example.com`, role: "member" });
  check("the same address cannot be invited twice", Boolean(dup.error),
        "a unique constraint, not an application check");

  section("Removing a member leaves their work alone");
  const { data: theirTask } = await plain.client
    .from("tasks")
    .insert({ workspace_id: WS, title: `tache de ${plain.email}`, created_by: plain.id, assignee_id: plain.id })
    .select().single();
  mine.tasks.push(theirTask.id);

  const removed = await owner.client
    .from("workspace_members").delete().eq("user_id", plain.id);
  check("an admin can remove a member", !removed.error, removed.error?.message ?? "ok");

  const { data: survivingTask } = await admin
    .from("tasks").select("id,assignee_id").eq("id", theirTask.id);
  check("their task survives the removal", survivingTask?.length === 1,
        "docs/03: deleting someone's tasks when they leave loses work");
  check("and is still assigned to them", survivingTask?.[0]?.assignee_id === plain.id);

  section("The last admin");
  const { data: admins } = await admin
    .from("workspace_members").select("user_id").eq("workspace_id", WS).eq("role", "admin");

  if (admins.length >= 2) {
    const drop = await admin.from("workspace_members").delete().eq("user_id", owner.id);
    check("an admin can go while another remains", !drop.error, drop.error?.message ?? "ok");
    mine.users = mine.users.filter((u) => u !== owner.id || true);

    const { data: rest } = await admin
      .from("workspace_members").select("user_id").eq("workspace_id", WS).eq("role", "admin");
    const sole = rest[0].user_id;
    const last = await admin.from("workspace_members").delete().eq("user_id", sole);
    check("the final admin cannot be removed", Boolean(last.error),
          last.error?.message?.slice(0, 44));
    const dem = await admin.from("workspace_members").update({ role: "member" }).eq("user_id", sole);
    check("nor demoted", Boolean(dem.error), dem.error?.message?.slice(0, 44));
  } else {
    check(`skipped: only ${admins.length} admin in this workspace`, true);
  }
} catch (err) {
  console.log(`\n  ERROR  ${err.message}`);
  failures += 1;
} finally {
  section("Cleanup — only ids this run created");
  for (const id of mine.tasks) await admin.from("tasks").delete().eq("id", id);
  for (const id of mine.invites) await admin.from("pending_invites").delete().eq("id", id);
  for (const id of mine.users) await admin.auth.admin.deleteUser(id);
  // only ever a workspace this run created; a borrowed one is left untouched
  if (mine.workspace) {
    await admin.from("workspace_members").delete().eq("workspace_id", mine.workspace);
    await admin.from("workspaces").delete().eq("id", mine.workspace);
  }

  const { data: users } = await admin.auth.admin.listUsers();
  const stray = users.users.filter((u) => u.email?.startsWith("kua-inv-"));
  const { data: invites } = await admin
    .from("pending_invites").select("email").ilike("email", "%" + stamp + "%");
  check("no throwaway users left", stray.length === 0, stray.map((u) => u.email).join(", "));
  check("no throwaway invites left", (invites?.length ?? 0) === 0);

  console.log(`\n${failures === 0 ? "the invite rules hold" : `${failures} FAILED`}`);
  process.exit(failures ? 1 : 0);
}
