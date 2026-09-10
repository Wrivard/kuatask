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

/** Scripted replies: set `nextError` to make the following write fail. */
const stub = `
export let nextError = null;
export function failNext(message) { nextError = { message }; }

const reply = () => {
  const err = nextError;
  nextError = null;
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

// store.ts pulls in time.ts for the streak history it now carries
for (const file of ["store.ts", "sound.ts", "time.ts"]) {
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
setErrorHandler((m) => errors.push(m));

const settle = () => new Promise((r) => setTimeout(r, 20));
const s = () => useStore.getState();
const titles = () => s().tasks.map((t) => t.title);
const byTitle = (t) => s().tasks.find((x) => x.title === t);

const ME = { id: "u1", display_name: "moi", accent: "green", sound_enabled: true, email: "a@b.c", created_at: "" };
const reset = () => {
  useStore.setState({
    tasks: [], members: [ME], me: ME, workspaceId: "ws1",
    ready: true, pending: new Map(), undoStack: [], assigneeFilter: null,
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

console.log(`\n${failures === 0 ? "the store behaves" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
