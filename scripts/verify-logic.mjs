/**
 * Pure-logic invariants for Küa Tasks.
 *
 *   npm run verify:logic
 *
 * No network, no database, no browser. Covers the date, parsing, grouping and
 * ordering logic that decides where every task appears — the parts where a
 * mistake is silent rather than loud.
 *
 * The modules import through the `@/` alias, which node cannot resolve, so the
 * suite copies lib/ into a temp directory and rewrites those imports to relative
 * paths. Type-only imports are stripped by node's type stripping, so the store
 * never has to be stubbed.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const NEEDED = ["time.ts", "copy.ts", "grouping.ts", "parse-fr.ts", "suggest.ts"];

// inside the project, so node resolves date-fns from the local node_modules
const tmp = fs.mkdtempSync(".verify-tmp-");
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));

for (const file of NEEDED) {
  const src = fs.readFileSync(path.join("lib", file), "utf8");
  fs.writeFileSync(
    path.join(tmp, file),
    src.replace(/from ["']@\/lib\/([a-z-]+)["']/g, 'from "./$1.ts"'),
  );
}
const load = (f) => import(pathToFileURL(path.join(tmp, f)).href);

const time = await load("time.ts");
const grouping = await load("grouping.ts");
const { parseFr } = await load("parse-fr.ts");
const suggest = await load("suggest.ts");

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const eq = (name, got, want) =>
  check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
const section = (n) => console.log(`\n${n}`);

const TODAY = time.today();

// --------------------------------------------------------------- buckets
section(`Buckets — today is ${TODAY} in Montreal`);
eq("no date is undated", time.bucketOf(null), "undated");
eq("today is today", time.bucketOf(TODAY), "today");
eq("tomorrow is tomorrow", time.bucketOf(time.tomorrow()), "tomorrow");
eq("yesterday folds into today", time.bucketOf(time.toDayString(new Date(time.toDate(TODAY).getTime() - 864e5))), "today");
check(
  "a date a year back still folds into today, not later",
  time.bucketOf(time.toDayString(new Date(time.toDate(TODAY).getTime() - 365 * 864e5))) === "today",
);
eq("a date a year out is later", time.bucketOf(time.toDayString(new Date(time.toDate(TODAY).getTime() + 365 * 864e5))), "later");

/*
  The invariant that matters most on the board: dropping a card on a date column
  must land it in that same column. If these disagree the card visibly jumps to
  a different column the moment you let go.
*/
section("Round trip — a card dropped on a date column stays in it");
for (const bucket of ["today", "tomorrow", "week", "month", "later", "undated"]) {
  const day = time.firstDayOfBucket(bucket);
  eq(`${bucket} -> ${day ?? "null"} -> ${time.bucketOf(day)}`, time.bucketOf(day), bucket);
}

// ------------------------------------------------------------- instants
section("Instants — the Montreal day, not the UTC one");
const cases = [
  ["21:00 EDT, summer", "2026-09-09T01:00:00Z", "2026-09-08"],
  ["23:59 EDT, summer", "2026-09-09T03:59:00Z", "2026-09-08"],
  ["21:00 EST, winter", "2026-12-16T02:00:00Z", "2026-12-15"],
  ["19:30 EST, winter", "2026-12-16T00:30:00Z", "2026-12-15"],
  ["midday", "2026-09-08T16:00:00Z", "2026-09-08"],
];
for (const [label, iso, want] of cases) {
  const got = time.instantToDay(iso);
  check(`${label}: ${iso.slice(0, 10)} UTC -> ${got}`, got === want, `want ${want}`);
}
check("isTodayInstant(null) is false", time.isTodayInstant(null) === false);

// ------------------------------------------------------------- formatting
section("Formatting");
eq("24-hour with an h separator", time.formatTime("14:00"), "14h");
eq("minutes kept when they matter", time.formatTime("14:30"), "14h30");
eq("no time is an empty string", time.formatTime(null), "");
eq("today reads as aujourd'hui", time.formatDueLabel(TODAY), "aujourd'hui");
eq("tomorrow reads as demain", time.formatDueLabel(time.tomorrow()), "demain");

// ---------------------------------------------------------------- streak
section("Streak — consecutive Montreal days with a completion");
const dayAgo = (n) => new Date(time.toDate(TODAY).getTime() - n * 864e5).toISOString();
eq("no completions is zero", time.computeStreak([]), 0);
eq("today alone is one", time.computeStreak([dayAgo(0)]), 1);
eq("three consecutive days", time.computeStreak([dayAgo(0), dayAgo(1), dayAgo(2)]), 3);
eq("a gap ends the streak", time.computeStreak([dayAgo(0), dayAgo(1), dayAgo(3)]), 2);
eq("twice in one day still counts once", time.computeStreak([dayAgo(0), dayAgo(0)]), 1);
eq("nothing today but yesterday survives", time.computeStreak([dayAgo(1), dayAgo(2)]), 2);
eq("an old streak that already lapsed is zero", time.computeStreak([dayAgo(5), dayAgo(6)]), 0);

// ---------------------------------------------------------------- parsing
section("French parsing — the strings reference/README.md requires");
const parseCases = [
  ["rappeler le fournisseur demain 14h", "rappeler le fournisseur", true, "14:00"],
  ["envoyer les maquettes @guillaume #acme vendredi", "envoyer les maquettes", true, null],
  ["renouveler le domaine dans 3 jours !", "renouveler le domaine", true, null],
  ["appeler le comptable lundi prochain", "appeler le comptable", true, null],
  ["préparer la soumission 15 mars", "préparer la soumission", true, null],
  ["faire le suivi 15/03", "faire le suivi", true, null],
  ["demain", "demain", false, null],
];
for (const [input, title, hasDate, dueTime] of parseCases) {
  const r = parseFr(input);
  check(`"${input}"`, r.title === title && Boolean(r.dueOn) === hasDate && r.dueTime === dueTime,
        `title=${JSON.stringify(r.title)} dueOn=${r.dueOn} time=${r.dueTime}`);
}
const numeric = parseFr("faire le suivi 15/03");
const named = parseFr("faire le suivi 15 mars");
check("15/03 and 15 mars agree", numeric.dueOn === named.dueOn, `${numeric.dueOn} vs ${named.dueOn}`);
check("a numeric date is never in the past", numeric.dueOn >= TODAY, String(numeric.dueOn));
const tagged = parseFr("envoyer les maquettes @guillaume #acme vendredi");
eq("assignee handle extracted", tagged.assigneeHandle, "guillaume");
eq("label extracted", tagged.label, "acme");
check("bang sets important", parseFr("renouveler le domaine dans 3 jours !").important === true);

// ------------------------------------------------------------ autocomplete
section("Autocomplete");
const tasks = [
  { id: "1", label: "acme" }, { id: "2", label: "acme" }, { id: "3", label: "acme" },
  { id: "4", label: "beta" }, { id: "5", label: "beta" }, { id: "6", label: null },
];
const members = [{ id: "u1", display_name: "wrivard" }, { id: "u2", display_name: "guillaume" }];
eq("labels ranked by frequency", suggest.labelsInUse(tasks), ["acme", "beta"]);
const tok = suggest.tokenAtCursor("envoyer #ac", 11);
eq("token under the cursor", [tok.kind, tok.query], ["label", "ac"]);
eq("matching suggestion", suggest.suggestionsFor(tok, tasks, members).map((s) => s.value), ["acme"]);
check("a finished token is left alone", suggest.tokenAtCursor("envoyer #acme ", 14) === null);
check("a sigil inside a word is not a token", suggest.tokenAtCursor("a#b", 3) === null);
eq("completion splices cleanly",
   suggest.applySuggestion("envoyer #ac", 11, tok, { value: "acme", label: "#acme" }).value,
   "envoyer #acme ");

// --------------------------------------------------------------- grouping
section("Grouping and ordering");
const accentOf = () => "#000";
const me = { id: "u1", display_name: "wrivard", accent: "green" };
const others = [me, { id: "u2", display_name: "guillaume", accent: "blue" }];
const board = [
  { id: "a", assignee_id: "u1", status: "todo", due_on: TODAY, position: 3 },
  { id: "b", assignee_id: "u2", status: "doing", due_on: null, position: 1 },
  { id: "c", assignee_id: null, status: "done", due_on: TODAY, position: 2 },
];

const byPerson = grouping.buildColumns("person", board, others, me, accentOf);
eq("you come first", byPerson.map((c) => c.key), ["u1", "u2", grouping.NO_ASSIGNEE]);
eq("unassigned lands in its own column", byPerson[2].tasks.map((t) => t.id), ["c"]);

const byStatus = grouping.buildColumns("status", board, others, me, accentOf);
eq("workflow order, not enum order", byStatus.map((c) => c.key), ["todo", "doing", "done"]);
eq("each card in its status column", byStatus.map((c) => c.tasks.map((t) => t.id)), [["a"], ["b"], ["c"]]);

// § 8.1 — a card completed a moment ago stays in the column it came from
const held = grouping.buildColumns("status", board, others, me, accentOf, new Map([["c", "todo"]]));
// membership, not order: the next assertion covers ordering, and columns sort
// by position so the held card lands wherever its position puts it
eq("a held card stays put for the beat", held[0].tasks.map((t) => t.id).sort(), ["a", "c"]);
eq("and is not yet in Terminé", held[2].tasks.length, 0);

const byDue = grouping.buildColumns("due", board, others, me, accentOf);
eq("columns sort by position", byDue.find((c) => c.key === "today").tasks.map((t) => t.id), ["c", "a"]);

check("columnOf agrees with buildColumns for person",
      grouping.columnOf("person", board[2]) === grouping.NO_ASSIGNEE);
check("columnOf agrees for status", grouping.columnOf("status", board[1]) === "doing");
check("columnOf agrees for due", grouping.columnOf("due", board[1]) === "undated");

const col = { tasks: [{ id: "x", position: 10 }, { id: "y", position: 20 }] };
eq("insert above", grouping.positionForDrop(col, 0, "z"), 9);
eq("insert between", grouping.positionForDrop(col, 1, "z"), 15);
eq("insert below", grouping.positionForDrop(col, 2, "z"), 21);
eq("a card is not its own neighbour", grouping.positionForDrop(col, 0, "y"), 9);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failures === 0 ? "all logic invariants hold" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
