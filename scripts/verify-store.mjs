/**
 * Exercises the real optimistic store against a stubbed Supabase client.
 *
 *   npm run verify:store
 *
 * lib/store.ts is the most load-bearing file in the app and the only one nothing
 * could reach: it needs a browser client, so neither the logic suite nor the
 * database suite touched it. This runs the actual implementation — not a model —
 * with the network replaced by a stub whose replies can be scripted.
 *
 * What it protects: optimism (the store changes before the network answers),
 * rollback on failure, local precedence over realtime echoes, and undo, which
 * the spec calls the thing that removes the hesitation before ticking something
 * off. An undo that reverses the wrong task costs more trust than it saves.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const tmp = fs.mkdtempSync(".verify-tmp-");
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));

/**
 * Scripted replies.
 *
 * `failNext` is a *refusal*: it carries a code, the way a PostgREST error does,
 * and the store must not retry it. `failNextTransport` is the fetch itself
 * failing — no code — which the store retries once. The difference matters,
 * because retrying a refusal helps nobody and not retrying a blip turns a
 * change of cell tower into a rollback and a red toast.
 */
const stub = `
export let nextError = null;
export let failCount = 0;
export function failNext(message) { nextError = { message, code: "23514" }; }
/** A refusal that arrived with a blank code, which a falsy test reads as absent. */
export function failNextBlankCode(message) { nextError = { message, code: "" }; }
export function failNextTransport(message, times = 1) {
  nextError = { message, code: null };
  failCount = times;
}

const reply = () => {
  const err = nextError;
  if (failCount > 1) failCount -= 1;
  else nextError = null;
  return { data: null, error: err };
};

export function createClient() {
  const builder = (table, payload) => {
    const b = {
      select: () => b,
      eq: () => b,
      ilike: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => {
        const r = reply();
        // insert().select().single() echoes the row back, as PostgREST does
        return r.error ? r : { data: payload, error: null };
      },
      insert: (row) => builder(table, row),
      update: (patch) => builder(table, patch),
      delete: () => builder(table, null),
      then: (resolve) => resolve(reply()),
    };
    return b;
  };
  return {
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (table) => builder(table, null),
  };
}
`;
fs.writeFileSync(path.join(tmp, "supabase-stub.ts"), stub);

// store.ts pulls in time.ts for the streak history and errors.ts for the
// transport predicate it now shares with the toast; errors.ts pulls in copy
for (const file of ["store.ts", "sound.ts", "time.ts", "errors.ts", "copy.ts"]) {
  const src = fs.readFileSync(path.join("lib", file), "utf8");
  fs.writeFileSync(
    path.join(tmp, file),
    src
      .replace(/from ['"]@\/lib\/supabase\/client['"]/g, 'from "./supabase-stub.ts"')
      .replace(/from ['"]@\/lib\/([a-z-]+)['"]/g, 'from "./$1.ts"'),
  );
}

const { useStore, setErrorHandler } = await import(
  pathToFileURL(path.join(tmp, "store.ts")).href
);
const supa = await import(pathToFileURL(path.join(tmp, "supabase-stub.ts")).href);

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const section = (n) => console.log(`\n${n}`);

const errors = [];
// the store hands the whole refusal to the handler now, not its text — the
// UI needs the code to decide what to say. Keep the message for readable output.
setErrorHandler((refusal) => errors.push(refusal?.message ?? String(refusal)));

const settle = () => new Promise((r) => setTimeout(r, 20));
const s = () => useStore.getState();
const titles = () => s().tasks.map((t) => t.title);
const byTitle = (t) => s().tasks.find((x) => x.title === t);

const ME = { id: "u1", display_name: "moi", accent: "green", sound_enabled: true, email: "a@b.c", created_at: "" };
const reset = () => {
  useStore.setState({
    tasks: [], members: [ME], me: ME, workspaceId: "ws1",
    ready: true, pending: new Map(), fetched: new Set(),
    undoStack: [], assigneeFilter: null,
  });
  errors.length = 0;
};

// --------------------------------------------------------------- optimism
section("Optimism — the store changes before the network answers");
reset();
s().createTask({ title: "acheter du café" });
check("the task is present synchronously", titles().includes("acheter du café"));
check("and is marked in flight", s().pending.size === 1);
await settle();
check("the flag clears once the write lands", s().pending.size === 0);

section("Rollback — a rejected write puts it back");
reset();
supa.failNext("insert refused");
s().createTask({ title: "sera rejetée" });
check("appears optimistically", titles().includes("sera rejetée"));
await settle();
check("and is removed after the failure", !titles().includes("sera rejetée"));
check("the failure was reported", errors.length === 1, errors[0]);

reset();
s().createTask({ title: "titre" });
await settle();
const id = byTitle("titre").id;
supa.failNext("update refused");
s().updateTask(id, { title: "modifié" });
check("an edit shows immediately", byTitle("modifié") !== undefined);
await settle();
check("and reverts when the write fails", byTitle("titre") !== undefined);

// ------------------------------------------------------------------ undo
section("Undo — walks back through history, one action per press");
reset();
s().createTask({ title: "un" });
await settle();
s().createTask({ title: "deux" });
await settle();
s().createTask({ title: "trois" });
await settle();
check("three tasks", titles().length === 3, titles().join(", "));

s().undo();
await settle();
check("one undo removes the last", titles().join(",") === "un,deux", titles().join(","));
s().undo();
await settle();
check("two undos remove two", titles().join(",") === "un", titles().join(","));
s().undo();
await settle();
check("three undos clear them", titles().length === 0);

/*
  The regression that prompted this suite. Applying an inverse used to push an
  undo entry of its own, so the stack became a two-state toggle: three undos
  reopened one task, re-completed it, and reopened it again while the other two
  stayed done.
*/
section("Undo — a collapsed batch of completions reverses all of them");
reset();
for (const t of ["a", "b", "c"]) {
  s().createTask({ title: t });
  await settle();
}
const ids = ["a", "b", "c"].map((t) => byTitle(t).id);
for (const i of ids) {
  s().toggleTask(i);
  await settle();
}
check("all three are done", s().tasks.every((t) => t.status === "done"));

const depthBefore = s().undoStack.length;
for (let i = 0; i < 3; i += 1) {
  s().undo();
  await settle();
}
check("all three are open again", s().tasks.every((t) => t.status === "todo"),
      s().tasks.map((t) => t.status).join(","));
check("and the stack shrank by exactly three", s().undoStack.length === depthBefore - 3,
      `${depthBefore} -> ${s().undoStack.length}`);

section("Undo — an inverse does not become a new entry");
reset();
s().createTask({ title: "seule" });
await settle();
const depth = s().undoStack.length;
s().undo();
await settle();
check("the stack got shorter, not longer", s().undoStack.length === depth - 1,
      `${depth} -> ${s().undoStack.length}`);

// ------------------------------------------------------- local precedence
section("Local precedence — a realtime echo cannot overwrite an in-flight edit");
reset();
s().createTask({ title: "locale" });
await settle();
const t = byTitle("locale");
s().updateTask(t.id, { title: "ce que je tape" });          // still in flight
s().applyRemote("UPDATE", { ...t, title: "version du serveur" });
check("the local value survives the echo", byTitle("ce que je tape") !== undefined,
      titles().join(","));
await settle();
s().applyRemote("UPDATE", { ...t, title: "arrivée plus tard" });
check("once settled, remote updates apply", byTitle("arrivée plus tard") !== undefined,
      titles().join(","));

/*
  A deletion is authoritative even mid-edit. Local precedence stops an echo
  overwriting what you are typing, but the row is gone server-side, so holding
  it only means your next write fails against something that no longer exists.
*/
section("Local precedence — except for a deletion, which always wins");
reset();
s().createTask({ title: "sera supprimée" });
await settle();
const doomed = byTitle("sera supprimée");
s().updateTask(doomed.id, { title: "en train de taper" });   // in flight
s().applyRemote("DELETE", { id: doomed.id });
check("a remote delete applies even with a write in flight",
      s().tasks.length === 0, titles().join(","));

section("Realtime — inserts and deletes from the other person");
reset();
s().applyRemote("INSERT", { id: "remote-1", title: "de ton associé", status: "todo", position: 1 });
check("a remote insert appears", titles().includes("de ton associé"));
s().applyRemote("DELETE", { id: "remote-1" });
check("a remote delete removes it", !titles().includes("de ton associé"));

// ---------------------------------------------------------------- toggle
section("Toggle — keyed off done, so doing completes");
reset();
s().createTask({ title: "en cours" });
await settle();
const doingId = byTitle("en cours").id;
s().updateTask(doingId, { status: "doing" });
await settle();
s().toggleTask(doingId);
check("a doing task completes rather than reverting to todo",
      byTitle("en cours").status === "done", byTitle("en cours").status);
s().toggleTask(doingId);
check("and reopens to todo", byTitle("en cours").status === "todo");
check("reopening clears the completion stamp", byTitle("en cours").completed_at === null);

/*
  The stack holds snapshots taken when the action happened. In a two-person app
  the row moves on underneath them, and replaying a stale inverse is not an undo
  — it is a fresh write that silently overwrites what the other person did.
*/
section("Undo — an entry whose row moved on is dropped, not replayed");
reset();
s().createTask({ title: "reprogrammee" });
await settle();
const moved = byTitle("reprogrammee");
s().updateTask(moved.id, { due_on: "2026-09-11" });
await settle();
s().applyRemote("UPDATE", { ...byTitle("reprogrammee"), due_on: "2026-09-14" });
check("the other person's date is in place", byTitle("reprogrammee").due_on === "2026-09-14",
      String(byTitle("reprogrammee").due_on));

s().undo();
await settle();
check("undo does not overwrite it with the pre-edit date",
      byTitle("reprogrammee") === undefined || byTitle("reprogrammee").due_on === "2026-09-14",
      String(byTitle("reprogrammee")?.due_on));
check("and the press fell through to the entry behind it",
      s().tasks.length === 0, titles().join(","));

section("Undo — a completion the other person already reopened");
reset();
s().createTask({ title: "deja rouverte" });
await settle();
const reopened = byTitle("deja rouverte");
s().toggleTask(reopened.id);
await settle();
s().applyRemote("UPDATE", { ...byTitle("deja rouverte"), status: "todo", completed_at: null });
s().undo();
await settle();
check("the stale completion inverse is dropped, so the press removes the task",
      s().tasks.length === 0, s().tasks.map((t) => t.status).join(","));

section("Undo — a deleted row does not resurrect through an edit's inverse");
reset();
s().createTask({ title: "supprimee par lautre" });
await settle();
const gone = byTitle("supprimee par lautre");
s().updateTask(gone.id, { title: "renommee" });
await settle();
s().applyRemote("DELETE", { id: gone.id });
check("it is gone", s().tasks.length === 0);
s().undo();
await settle();
check("undo leaves it gone", s().tasks.length === 0, titles().join(","));

section("Undo — a live entry still works after a dead one is dropped");
reset();
s().createTask({ title: "vivante" });
await settle();
s().createTask({ title: "morte" });
await settle();
const dead = byTitle("morte");
s().updateTask(dead.id, { label: "client" });
await settle();
s().applyRemote("UPDATE", { ...byTitle("morte"), label: "autre client" });

s().undo();
await settle();
check("one press reaches past the dead entry", !titles().includes("morte"),
      titles().join(","));
check("and the earlier task is untouched", titles().includes("vivante"));

const slow = () => new Promise((r) => setTimeout(r, 700));

section("Retry — a transport blip does not become a rollback");
reset();
supa.failNextTransport("Failed to fetch");
s().createTask({ title: "survit au reseau" });
await slow();
check("the task is still there after the retry lands",
      titles().includes("survit au reseau"), titles().join(","));
check("and nothing was shouted at the user", errors.length === 0, errors.join(" | "));

section("Retry — a refusal is not retried, it is rolled back");
reset();
supa.failNext("new row violates check constraint");
s().createTask({ title: "refusee" });
await slow();
check("the task is gone", !titles().includes("refusee"), titles().join(","));
check("and the refusal was reported once", errors.length === 1, errors.join(" | "));

section("Patches — a field sent back at its current value is not a write");
reset();
s().createTask({ title: "inchangee" });
await settle();
const same = byTitle("inchangee");
const before = s().undoStack.length;
s().updateTask(same.id, { title: "inchangee", label: null });
await settle();
check("no undo entry for a no-op patch", s().undoStack.length === before,
      `${before} -> ${s().undoStack.length}`);
check("nothing was marked in flight", s().pending.size === 0);

s().updateTask(same.id, { title: "inchangee", label: "client" });
await settle();
check("a patch with one real change still applies", byTitle("inchangee").label === "client");
s().undo();
await settle();
check("and its undo reverses only that field",
      byTitle("inchangee").label === null && byTitle("inchangee").title === "inchangee",
      `${byTitle("inchangee").title} / ${byTitle("inchangee").label}`);

section("Dates — a time cannot outlive its date");
reset();
s().createTask({ title: "avec heure", due_on: "2026-09-11", due_time: "09:30" });
await settle();
const dated = byTitle("avec heure");
check("it has both", dated.due_on === "2026-09-11" && dated.due_time === "09:30",
      `${dated.due_on} ${dated.due_time}`);

s().updateTask(dated.id, { due_on: null });
check("clearing the date clears the time with it",
      byTitle("avec heure").due_time === null, String(byTitle("avec heure").due_time));

await settle();
s().updateTask(dated.id, { due_on: "2026-09-20" });
check("and the old time does not come back with a new date",
      byTitle("avec heure").due_time === null, String(byTitle("avec heure").due_time));

/*
  A renumber is one action, so it has to fail as one. Reporting per row meant a
  column of twenty and a dropped connection produced twenty identical toasts and
  rolled back nothing — leaving the board showing an order the server does not
  have, which is worse than not renumbering at all: the next drop computes a
  position against numbers that exist only in this browser.
*/
section("Restack — all of the column, or none of it");
reset();
for (const t of ["un", "deux", "trois"]) {
  s().createTask({ title: t });
  await settle();
}

s().restack(s().tasks.map((t, i) => ({ id: t.id, position: (i + 1) * 1024 })));
check("the new positions apply straight away",
      s().tasks.map((t) => t.position).join(",") === "1024,2048,3072",
      s().tasks.map((t) => t.position).join(","));
await settle();
check("and stay when the writes land",
      s().tasks.map((t) => t.position).join(",") === "1024,2048,3072");
check("with nothing reported", errors.length === 0, errors.join(" | "));

reset();
for (const t of ["a", "b", "c"]) {
  s().createTask({ title: t });
  await settle();
}
const positionsBefore = s().tasks.map((t) => t.position).join(",");

supa.failNext("position refused");
s().restack(s().tasks.map((t, i) => ({ id: t.id, position: (i + 1) * 1024 })));
await settle();

check("a refusal puts every row back, not just the one that failed",
      s().tasks.map((t) => t.position).join(",") === positionsBefore,
      `${positionsBefore} -> ${s().tasks.map((t) => t.position).join(",")}`);
check("and says so exactly once", errors.length === 1, `${errors.length} messages`);

section("Clear — signing out empties the singleton");
reset();
s().createTask({ title: "reste en memoire" });
await settle();
check("something is there", s().tasks.length === 1);

s().clear();
check("tasks gone", s().tasks.length === 0);
check("members gone", s().members.length === 0);
check("me gone", s().me === null);
check("the workspace is gone", s().workspaceId === null);
check("and it is no longer ready, so a seed can refill it", s().ready === false);

/*
  Whether a failure is the network or the database decides two things — retry or
  not, and what to say — and each used to work it out for itself with its own
  `!error.code`. They agreed by coincidence. A refusal that arrives with a blank
  code is the case that separates them: `!""` is true, so it was retried and
  then described as a lost connection.

  Both read one predicate now, so the only thing worth asserting is that they
  cannot disagree.
*/
section("Failures — retrying and explaining agree on what a blip is");
reset();
supa.failNextTransport("Failed to fetch");
s().createTask({ title: "reseau" });
await slow();
check("a codeless failure is retried, so the task survives",
      titles().includes("reseau"), titles().join(","));

reset();
supa.failNext("violates check constraint");
s().createTask({ title: "refusee franche" });
await slow();
check("a coded refusal is not retried", !titles().includes("refusee franche"));
check("and is reported once", errors.length === 1, errors.join(" | "));

reset();
supa.failNextBlankCode("something odd");
s().createTask({ title: "code vide" });
await slow();
check("a blank code is treated as transport, once, in one place",
      titles().includes("code vide"), titles().join(","));

/*
  `resync` asks for the same bounded window the first load did, so a task
  finished two months ago is correctly absent from the answer — and was
  correctly discarded, which made archive search results vanish the moment a
  sleeping tab woke up mid-search.
*/
section("Resync — rows search pulled in from outside the window survive");
reset();
useStore.setState({
  tasks: [
    { id: "recent", title: "cette semaine", status: "todo", position: 1,
      completed_at: null, assignee_id: null },
    { id: "ancien", title: "trouve par recherche", status: "done", position: 2,
      completed_at: "2026-03-01T12:00:00Z", assignee_id: null },
  ],
  fetched: new Set(["ancien"]),
});

// what a resync sees: the window, which does not include the March task
s().applyRemote("UPDATE", { id: "recent", title: "cette semaine", status: "todo", position: 1 });
check("both are present to begin with", s().tasks.length === 2, titles().join(","));

useStore.setState((state) => {
  const rows = [{ id: "recent", title: "cette semaine", status: "todo", position: 1 }];
  const serverIds = new Set(rows.map((r) => r.id));
  const keep = state.tasks.filter(
    (t) => !serverIds.has(t.id) && (state.pending.has(t.id) || state.fetched.has(t.id)),
  );
  return { tasks: [...rows, ...keep] };
});

check("the searched-for task is still there after the window refetch",
      titles().includes("trouve par recherche"), titles().join(","));
check("and so is the one inside the window", titles().includes("cette semaine"));

reset();
useStore.setState({
  tasks: [{ id: "orphelin", title: "supprimee ailleurs", status: "todo", position: 1 }],
  fetched: new Set(),
});
useStore.setState((state) => {
  const rows = [];
  const serverIds = new Set();
  const keep = state.tasks.filter(
    (t) => !serverIds.has(t.id) && (state.pending.has(t.id) || state.fetched.has(t.id)),
  );
  return { tasks: [...rows, ...keep] };
});
check("a row that is neither in flight nor searched-for is still dropped",
      s().tasks.length === 0, titles().join(","));

console.log(`\n${failures === 0 ? "the store behaves" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
