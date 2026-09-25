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

const NEEDED = [
  "time.ts",
  "copy.ts",
  "grouping.ts",
  "parse-fr.ts",
  "suggest.ts",
  "compose.ts",
  "routing.ts",
  "links.ts",
  "session-reset.ts",
  "sound.ts",
  "edit.ts",
  "motion.ts",
  "search.ts",
  "calendar.ts",
  "routes.ts",
  "fresh.ts",
  "billing.ts",
  "assignee.ts",
  "recurrence.ts",
];

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
const { composeTask } = await load("compose.ts");
const routing = await load("routing.ts");
const { extractLinks } = await load("links.ts");
const { textPatch } = await load("edit.ts");
const motion = await load("motion.ts");
const search = await load("search.ts");
const calendar = await load("calendar.ts");
const routes = await load("routes.ts");
const fresh = await load("fresh.ts");
const billing = await load("billing.ts");
const assignee = await load("assignee.ts");
const recurrence = await load("recurrence.ts");
const reset = await load("session-reset.ts");
const sound = await load("sound.ts");

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
  if (day === undefined) {
    check(`${bucket} has no day left today, so the drop is declined`, true);
    continue;
  }
  eq(`${bucket} -> ${day ?? "null"} -> ${time.bucketOf(day)}`, time.bucketOf(day), bucket);
}

/*
  The round trip above only ever ran against whatever today happened to be, and
  it passes on most days by luck. On a Saturday "cette semaine" is over, and on
  the 30th so is "ce mois-ci" — the old code clamped to the boundary, so a card
  dropped on Cette semaine landed in Demain, jumped a column, and produced a
  toast saying it had been rescheduled. Every day of a year, not just this one.
*/
section("Round trip — every day of a year, not just today");
{
  const { addDays } = await import("date-fns");
  const base = time.toDate("2026-01-01");
  const wrong = [];
  const declined = { week: 0, month: 0 };

  for (let i = 0; i < 365; i += 1) {
    const todayDay = time.toDayString(addDays(base, i));
    for (const bucket of ["today", "tomorrow", "week", "month", "later", "undated"]) {
      const day = time.firstDayOfBucket(bucket, todayDay);
      if (day === undefined) {
        declined[bucket] = (declined[bucket] ?? 0) + 1;
        continue;
      }
      const back = time.bucketOf(day, todayDay);
      if (back !== bucket) wrong.push(`${todayDay} ${bucket} -> ${day} -> ${back}`);
    }
  }

  check("no day of the year lands a card in the wrong column", wrong.length === 0,
        wrong.slice(0, 3).join(" | "));
  check("and the declines are the days those buckets are genuinely over", true,
        `cette semaine ${declined.week}x, ce mois-ci ${declined.month}x`);
}

/*
  The day-dependent helpers take the day as a parameter now, so they can be
  pinned instead of being read from the clock. That is what lets a view inside a
  useMemo depend on the day honestly, and what makes a tab left open across
  midnight re-bucket instead of showing yesterday.
*/
section("Pinned day — the helpers no longer read the clock");
const PINNED = "2026-06-15"; // a Monday
eq("a task due on the pinned day is today", time.bucketOf("2026-06-15", PINNED), "today");
eq("the next day is tomorrow", time.bucketOf("2026-06-16", PINNED), "tomorrow");
eq("later that week", time.bucketOf("2026-06-20", PINNED), "week");
eq("the following week is this month", time.bucketOf("2026-06-25", PINNED), "month");
eq("next month is later", time.bucketOf("2026-07-20", PINNED), "later");
eq("the past folds into today", time.bucketOf("2026-05-01", PINNED), "today");
check("isToday honours the pinned day", time.isToday("2026-06-15", PINNED) === true);
check("and rejects another day", time.isToday("2026-06-16", PINNED) === false);
check("isOnDay matches a Montreal evening instant",
      time.isOnDay("2026-06-16T02:00:00Z", PINNED) === true);
check("isOnDay(null) is false", time.isOnDay(null, PINNED) === false);
eq("streak counts back from the pinned day",
   time.computeStreak(["2026-06-15T16:00:00Z", "2026-06-14T16:00:00Z"], PINNED), 2);
check("msUntilNextDay is inside a day and never zero",
      time.msUntilNextDay() > 0 && time.msUntilNextDay() <= 86_401_000,
      String(time.msUntilNextDay()));

/*
  The day's work clears at midnight.

  The board and the list footer both show a completed task only while
  `isOnDay(completed_at, today)` holds, so "everything done today, then a clean
  slate tomorrow" is entirely this predicate plus `useToday` moving the day. The
  rows are never deleted — they stay in the database and in the activity log —
  they simply stop being today's work.

  The instants below are UTC, which is the point: `completed_at` is a
  timestamptz and Montreal is four or five hours behind, so an evening here is
  already tomorrow in UTC. Comparing the raw instant to a calendar day is the
  single most common way this app breaks.
*/
{
  const day = "2026-06-16";       // a Tuesday in EDT, UTC-4
  const next = "2026-06-17";

  // 20:00 Montreal on the 16th is 00:00 UTC on the 17th
  const evening = "2026-06-17T00:00:00Z";
  check("a task finished this evening is part of today",
        time.isOnDay(evening, day) === true, evening);
  check("and is gone from today the moment the day turns",
        time.isOnDay(evening, next) === false, evening);

  // 23:59:59 Montreal, the last second that still counts as today
  const lastSecond = "2026-06-17T03:59:59Z";
  check("the last second before midnight still counts as today",
        time.isOnDay(lastSecond, day) === true, lastSecond);

  // 00:00:00 Montreal the next morning
  const firstSecond = "2026-06-17T04:00:00Z";
  check("the first second after it does not",
        time.isOnDay(firstSecond, day) === false, firstSecond);
  check("it belongs to the new day instead",
        time.isOnDay(firstSecond, next) === true, firstSecond);

  /*
    The fetch window is deliberately wider than the display window. The views
    show one day; the store keeps a week, so undoing yesterday's completion and
    restoring a deleted task still have rows to work with.
  */
  check("the store's window is wider than the day the views show",
        time.RECENT_COMPLETION_DAYS >= 2, String(time.RECENT_COMPLETION_DAYS));
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

/*
  "rappeler le client demain matin" is a normal French sentence. The parser used
  to keep "matin" in the title and set no time, so the task sorted ahead of a
  16h one on a day ordered by time — the wrong way round. These are not precise
  and are not pretending to be: they are the start of the part of the day meant,
  which is enough to order a list.
*/
section("Time of day");
{
  const at = (line) => {
    const r = parseFr(line);
    return [r.title, r.dueTime];
  };

  eq("demain matin", at("rappeler le client demain matin"), ["rappeler le client", "08:00"]);
  eq("cet apres-midi", at("reunion cet apres-midi"), ["reunion", "13:00"]);
  eq("ce soir", at("souper ce soir"), ["souper", "18:00"]);
  eq("a midi", at("appeler a midi"), ["appeler", "12:00"]);
  eq("fin de journee", at("preparer la fin de journee"), ["preparer", "16:00"]);
  // the leading "de" is part of the phrase, so it goes with it
  eq("debut de matinee", at("appel de debut de matinee"), ["appel", "07:00"]);

  // a clock time wins, but the words still have to leave the title
  eq("a clock time wins over the part of day",
     at("reunion demain matin a 10h"), ["reunion", "10:00"]);

  // "demain" belongs to the date pass and must survive this one
  check("the day word is left for the date pass",
        parseFr("rappeler le client demain matin").dueOn === parseFr("rappeler demain").dueOn);
  check("a weekday too",
        parseFr("relancer lundi soir").dueOn === parseFr("relancer lundi").dueOn);

  eq("apres-midi is not read as midi", at("envoyer le devis apres-midi"),
     ["envoyer le devis", "13:00"]);
  eq("an ordinary line is untouched", at("payer la facture"), ["payer la facture", null]);
  eq("and so is one that merely contains the letters",
     at("preparer le sominaire"), ["preparer le sominaire", null]);
}

// ------------------------------------------------------------ autocomplete
section("Autocomplete");
const tasks = [
  { id: "1", label: "acme" }, { id: "2", label: "acme" }, { id: "3", label: "acme" },
  { id: "4", label: "beta" }, { id: "5", label: "beta" }, { id: "6", label: null },
];
const members = [
  { id: "u1", display_name: "wrivard", email: "wrivard@kua.quebec" },
  { id: "u2", display_name: "guillaume", email: "gberther@kua.quebec" },
];
eq("labels ranked by frequency", suggest.labelsInUse(tasks), ["acme", "beta"]);

/*
  Raw frequency ranks a client you billed forty hours to last spring above the
  one you are on this week, which is backwards for a field you are typing into
  right now. Each use decays by half every fortnight.
*/
{
  const NOW = Date.parse("2026-09-10T12:00:00Z");
  const day = (n) => new Date(NOW - n * 86400000).toISOString();
  const aged = [
    { id: "a", label: "ancien", updated_at: day(90) },
    { id: "b", label: "ancien", updated_at: day(92) },
    { id: "c", label: "ancien", updated_at: day(95) },
    { id: "d", label: "ancien", updated_at: day(97) },
    { id: "e", label: "courant", updated_at: day(1) },
  ];
  eq("one recent use outranks four old ones",
     suggest.labelsInUse(aged, NOW), ["courant", "ancien"]);

  const even = [
    { id: "a", label: "deux", updated_at: day(2) },
    { id: "b", label: "deux", updated_at: day(2) },
    { id: "c", label: "un", updated_at: day(2) },
  ];
  eq("at equal age it is still frequency", suggest.labelsInUse(even, NOW), ["deux", "un"]);
}

/*
  A person is addressed by the local part of their address all day. @gberther
  used to match nothing at all, because only the display name was searched.
*/
{
  const byHandle = suggest.tokenAtCursor("appeler @gber", 13);
  eq("an address local part completes to the person",
     suggest.suggestionsFor(byHandle, tasks, members).map((s) => s.value), ["guillaume"]);

  const byName = suggest.tokenAtCursor("appeler @guil", 13);
  eq("and the display name still does",
     suggest.suggestionsFor(byName, tasks, members).map((s) => s.value), ["guillaume"]);
}
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
  { id: "d", assignee_id: null, shared: true, status: "todo", due_on: TODAY, position: 4 },
];

const byPerson = grouping.buildColumns("person", board, others, me, accentOf);
eq("you come first, then both of you, then nobody", byPerson.map((c) => c.key), [
  "u1",
  "u2",
  assignee.BOTH,
  grouping.NO_ASSIGNEE,
]);
eq("a task that is both people's is in its own column", byPerson[2].tasks.map((t) => t.id), ["d"]);
eq("unassigned lands in its own column", byPerson[3].tasks.map((t) => t.id), ["c"]);
eq(
  "and a shared card knows which column it is in",
  grouping.columnOf("person", board[3], others),
  assignee.BOTH,
);

const byStatus = grouping.buildColumns("status", board, others, me, accentOf);
eq("workflow order, not enum order", byStatus.map((c) => c.key), ["todo", "doing", "done"]);
eq("each card in its status column", byStatus.map((c) => c.tasks.map((t) => t.id)), [["a", "d"], ["b"], ["c"]]);

// § 8.1 — a card completed a moment ago stays in the column it came from
const held = grouping.buildColumns("status", board, others, me, accentOf, new Map([["c", "todo"]]));
// membership, not order: the next assertion covers ordering, and columns sort
// by position so the held card lands wherever its position puts it
eq("a held card stays put for the beat", held[0].tasks.map((t) => t.id).sort(), ["a", "c", "d"]);
eq("and is not yet in Terminé", held[2].tasks.length, 0);

// the board buckets against the day it is handed, not the clock
const pinnedBoard = [
  { id: "p", assignee_id: null, status: "todo", due_on: "2026-06-15", position: 1 },
  { id: "q", assignee_id: null, status: "todo", due_on: "2026-06-16", position: 2 },
];
const pinnedCols = grouping.buildColumns("due", pinnedBoard, others, me, accentOf, new Map(), PINNED);
eq("board buckets against the day it is given",
   [pinnedCols.find((c) => c.key === "today").tasks.map((t) => t.id),
    pinnedCols.find((c) => c.key === "tomorrow").tasks.map((t) => t.id)],
   [["p"], ["q"]]);

const byDue = grouping.buildColumns("due", board, others, me, accentOf);
eq("columns sort by position", byDue.find((c) => c.key === "today").tasks.map((t) => t.id), ["c", "a", "d"]);

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
/*
  bucketOf and instantToDay were rewritten for speed — string comparison against
  boundaries computed once per day, and Intl instead of TZDate. Speed is not
  worth a single wrong bucket, so the fast path is checked against the slow one
  it replaced, over a full year around a pinned day and both DST changeovers.
*/
section("Buckets — the fast path agrees with date-fns, every day for a year");
{
  const { differenceInCalendarDays, endOfWeek, endOfMonth, isBefore, addDays } =
    await import("date-fns");

  const slowBucket = (dueOn, todayDay) => {
    if (!dueOn) return "undated";
    const d = time.toDate(dueOn);
    const t = time.toDate(todayDay);
    const delta = differenceInCalendarDays(d, t);
    if (delta < 0) return "today";
    if (delta === 0) return "today";
    if (delta === 1) return "tomorrow";
    if (!isBefore(endOfWeek(t, { weekStartsOn: 1 }), d)) return "week";
    if (!isBefore(endOfMonth(t), d)) return "month";
    return "later";
  };

  let mismatches = [];
  const base = time.toDate("2026-01-01");
  for (let i = 0; i < 365; i += 1) {
    const todayDay = time.toDayString(addDays(base, i));
    for (const offset of [-400, -31, -7, -1, 0, 1, 2, 3, 6, 7, 8, 14, 30, 31, 60, 400]) {
      const due = time.toDayString(addDays(time.toDate(todayDay), offset));
      const fast = time.bucketOf(due, todayDay);
      const slow = slowBucket(due, todayDay);
      if (fast !== slow) mismatches.push(`${todayDay}+${offset}: ${fast} vs ${slow}`);
    }
  }
  check("5840 day pairs, no disagreement", mismatches.length === 0,
        mismatches.slice(0, 3).join(" | "));
}

section("Instants — the cache does not outlive its key");
{
  const evening = "2026-07-15T23:30:00Z";   // already the 16th in UTC
  const first = time.instantToDay(evening);
  const again = time.instantToDay(evening);
  eq("the same instant gives the same day twice", again, first);
  eq("and it is the Montreal day, not the UTC one", first, "2026-07-15");
  eq("a different instant is not served from it",
     time.instantToDay("2026-07-16T23:30:00Z"), "2026-07-16");
  eq("an instant in the other DST offset", time.instantToDay("2026-01-15T23:30:00Z"),
     "2026-01-15");
}

/*
  The composer's whole path, end to end: parse a line, honour what the person
  overrode, resolve a handle to a real person, decide the title. It lived inside
  the component, which is why nothing could reach it — and it is the most
  consequential path in the app, because a mistake here loses words out of a
  task at the exact moment somebody is trying to write something down.
*/
section("Composing — what a typed line becomes");
{
  const people = [
    { id: "u1", display_name: "wrivard", email: "wrivard@kua.quebec" },
    { id: "u2", display_name: "guillaume", email: "gberther@kua.quebec" },
  ];
  const none = new Set();
  const make = (value, dismissed = none, extra = {}) =>
    composeTask({ value, dismissed, members: people, ...extra });

  const plain = make("acheter du cafe");
  eq("a bare line is just a title", plain.title, "acheter du cafe");
  check("with nothing else attached",
        plain.due_on === null && plain.label === null && plain.assignee_id === null &&
        plain.important === false);

  const full = make("envoyer la facture demain #acme @guillaume !");
  eq("the notation comes out of the title", full.title, "envoyer la facture");
  eq("the label is extracted", full.label, "acme");
  eq("the person is resolved", full.assignee_id, "u2");
  check("the date is set", full.due_on !== null, String(full.due_on));
  check("and the bang", full.important === true);

  eq("a handle resolves from the address too",
     make("relancer @gberther").assignee_id, "u2");

  /*
    The one that matters. "Appeler Marie demain matin" is a real task title, and
    dismissing the date has to put the words back rather than drop them.
  */
  const kept = make("appeler Marie demain", new Set(["date"]));
  check("dismissing a date returns its words to the title",
        kept.title.includes("demain"), kept.title);
  eq("and the date is not set", kept.due_on, null);

  const notation = make("envoyer la facture #acme", new Set(["label"]));
  eq("dismissing a label does not put #acme back in the title",
     notation.title, "envoyer la facture");
  eq("but it does drop the label", notation.label, null);

  /*
    A default far from today, derived rather than written.

    This used to pass `"2026-09-20"` as the default and assert that parsing
    « demain » produced something *different* from it. That held until the clock
    reached 2026-09-19, when tomorrow became the literal and the test failed
    without anything in the app changing — a date-dependent assertion with a
    fuse on it.

    Asserting the parsed value *equals* tomorrow is both stronger and immune to
    the calendar: it tests the intent rather than a proxy for it.
  */
  const { addDays: plusDays } = await import("date-fns");
  const farOff = time.toDayString(plusDays(time.nowTz(), 30));
  eq("a composer pre-dated to a day uses it",
     make("ranger le bureau", none, { defaultDueOn: farOff }).due_on, farOff);
  eq("and a parsed date wins over that default",
     make("ranger le bureau demain", none, { defaultDueOn: farOff }).due_on,
     time.tomorrow());
  eq("a lens on a person assigns to them",
     make("ranger le bureau", none, { defaultAssigneeId: "u1" }).assignee_id, "u1");

  eq("an empty line composes to nothing", make("   ").title, "");

  /*
    Stripping never empties a line. A task genuinely called "demain" keeps its
    name, and a line that is nothing but notation keeps its text *and* drops the
    readings — so it becomes one odd-looking task rather than an empty one
    carrying a label and an assignee it never showed you.
  */
  const bare = make("demain");
  eq("a task called demain keeps its title", bare.title, "demain");
  eq("and is not given that date", bare.due_on, null);

  const onlyNotation = make("#acme @guillaume !");
  eq("pure notation keeps its text", onlyNotation.title, "#acme @guillaume !");
  check("and carries none of the readings twice",
        onlyNotation.label === null && onlyNotation.assignee_id === null &&
        onlyNotation.important === false);

  /*
    The chips render from `readings`, not from the decided values — a chip that
    has been switched off still has to show what it would put back, and the
    decided value for a dismissed date is null. The composer used to get this by
    parsing the same string a second time, which was two answers that could in
    principle disagree.
  */
  const overridden = make("appeler Marie demain #acme", new Set(["date", "label"]));
  eq("the decided date is gone", overridden.due_on, null);
  check("but the reading is still reported", overridden.readings.dueOn !== null,
        String(overridden.readings.dueOn));
  eq("the decided label is gone", overridden.label, null);
  eq("and its reading survives for the chip", overridden.readings.label, "acme");
  check("matched still names both", overridden.matched.has("date") &&
        overridden.matched.has("label"));

  const untouched = make("appeler Marie demain #acme");
  eq("with nothing dismissed the two agree on the label",
     [untouched.label, untouched.readings.label], ["acme", "acme"]);
  eq("and on the date", untouched.due_on, untouched.readings.dueOn);
}

/*
  Every branch here is a way to lock somebody out of their own task manager, and
  the failures are asymmetric: sending a signed-in person to /login is annoying,
  but a loop between /login and / leaves the app unusable with nothing on screen
  to explain it. Eight interesting combinations, all of them walked.
*/
section("Routing — where a request ends up");
{
  const at = (pathname, hasUser, hasWorkspace, hadSessionCookie = false) =>
    routing.routeFor({ pathname, hasUser, hasWorkspace, hadSessionCookie });
  const shape = (d) => [d.action, d.to ?? "", d.search ?? ""].join(" ").trim();

  eq("a stranger on the app is sent to login", shape(at("/", false, false)),
     "redirect /login");
  eq("a stranger on login stays", shape(at("/login", false, false)), "pass");
  eq("a stranger on the auth callback stays", shape(at("/auth/callback", false, false)),
     "pass");
  eq("the health probe answers without a session", shape(at("/api/health", false, false)),
     "pass");

  eq("an expired session says so", shape(at("/", false, false, true)),
     "redirect /login expired=1");
  eq("but a first visit does not", shape(at("/", false, false, false)),
     "redirect /login");

  eq("a signed-in stranger goes to no-access", shape(at("/", true, false)),
     "redirect /no-access");
  eq("and no-access does not redirect to itself", shape(at("/no-access", true, false)),
     "pass");

  eq("a member on the app passes", shape(at("/", true, true)), "pass");
  eq("a member on the board passes", shape(at("/board", true, true)), "pass");
  eq("a member on login is sent home", shape(at("/login", true, true)), "redirect /");
  eq("a member on no-access is sent home", shape(at("/no-access", true, true)),
     "redirect /");

  // the loop that would be invisible: / -> /login -> / -> ...
  check("no state redirects to a path that redirects back",
        shape(at("/login", true, true)) === "redirect /" &&
        shape(at("/", true, true)) === "pass");
}

/*
  `position` is a double, so dropping a card between the same two neighbours
  halves the gap toward zero. After about fifty such moves the midpoint stops
  being distinguishable and the card refuses to move, with nothing on screen to
  say why. The guard has to fire before the arithmetic gives out, not after.
*/
section("Positions — the gap between two cards is finite");
{
  const col = (positions) => ({
    key: "c",
    title: "c",
    tasks: positions.map((position, i) => ({ id: `t${i}`, position })),
  });

  eq("an empty column gets a value", typeof grouping.positionForDrop(col([]), 0, "x"),
     "number");
  eq("dropping between 1 and 3 gives 2",
     grouping.positionForDrop(col([1, 3]), 1, "x"), 2);
  eq("dropping at the top goes below the first",
     grouping.positionForDrop(col([10, 20]), 0, "x"), 9);
  eq("dropping at the end goes above the last",
     grouping.positionForDrop(col([10, 20]), 2, "x"), 21);

  // halve until the gap is gone, exactly as repeated reordering would
  let lo = 1;
  let hi = 2;
  let halvings = 0;
  while (grouping.positionForDrop(col([lo, hi]), 1, "x") !== null && halvings < 200) {
    hi = (lo + hi) / 2;
    halvings += 1;
  }
  check("a collapsed gap is refused rather than silently rounded",
        halvings < 200, `gave up after ${halvings} halvings`);
  check("and it holds out for a realistic number of reorders", halvings >= 19,
        `${halvings} halvings before the guard fired`);

  const restacked = grouping.restackedPositions(col([1, 1.0000001, 1.0000002]));
  eq("a restack spreads them evenly", restacked.map((r) => r.position),
     [1024, 2048, 3072]);
  check("and the gaps are wide enough to subdivide again",
        grouping.positionForDrop(col(restacked.map((r) => r.position)), 1, "x") === 1536);

  /*
    The bug this caught, which was in the fix rather than the original.

    The first attempt renumbered the column and then asked positionForDrop
    again — using the same Column object, which was built during an earlier
    render and still held the old positions. So the second question got the
    same answer as the first, the card refused to move, and the refusal looked
    exactly like the problem it was meant to solve.

    placeInColumn answers both halves against the spread positions, so the
    caller never has to hold a stale object between two questions.
  */
  const crushed = col([1, 1 + 1e-9, 1 + 2e-9]);

  const roomy = grouping.placeInColumn(col([1, 3]), 1, "x");
  eq("a column with room needs no restack", roomy.restack, null);
  eq("and places between its neighbours", roomy.position, 2);

  const tight = grouping.placeInColumn(crushed, 1, "x");
  check("a crushed column asks for one", tight.restack !== null);
  eq("which is the even spread", tight.restack.map((r) => r.position),
     [1024, 2048, 3072]);
  check("and the card still gets a real place, not the old one",
        tight.position !== null && tight.position !== undefined &&
        Number.isFinite(tight.position),
        String(tight.position));
  check("strictly between the restacked neighbours it was dropped between",
        tight.position > 1024 && tight.position < 2048, String(tight.position));
}

/*
  Notes are where a staging URL, a Figma file or a ticket ends up, and a
  textarea cannot hold a link. These are listed under the field instead — which
  means an href built from somebody else's text, so the scheme matters more than
  the convenience does.
*/
section("Links in notes");
{
  const hrefs = (text) => extractLinks(text).map((l) => l.href);
  const labels = (text) => extractLinks(text).map((l) => l.label);

  eq("nothing in, nothing out", extractLinks(null), []);
  eq("plain text has no links", hrefs("rappeler le client"), []);

  eq("an https url is found", hrefs("voir https://figma.com/file/xY7f"),
     ["https://figma.com/file/xY7f"]);
  eq("http too", hrefs("http://staging.kua.quebec"), ["http://staging.kua.quebec"]);

  eq("a sentence's full stop is not part of the url",
     hrefs("le devis est sur https://kua.quebec/devis."), ["https://kua.quebec/devis"]);
  eq("nor a closing bracket",
     hrefs("(https://kua.quebec/a) et la suite"), ["https://kua.quebec/a"]);

  eq("the same link twice is listed once",
     hrefs("https://kua.quebec et encore https://kua.quebec").length, 1);
  eq("two different ones are both listed",
     hrefs("https://a.quebec et https://b.quebec").length, 2);

  /*
    An href is a thing a colleague clicks. javascript: and data: in someone
    else's notes are a way to run something in your session, so neither is ever
    turned into a link.
  */
  eq("javascript: is never a link", hrefs("javascript:alert(1)"), []);
  eq("data: is never a link", hrefs("data:text/html,<script>x</script>"), []);
  eq("nor file:", hrefs("file:///etc/passwd"), []);
  eq("and one hidden mid-sentence is still refused",
     hrefs("clique ici javascript:alert(document.cookie) merci"), []);

  eq("the label is the host and the last segment",
     labels("https://www.figma.com/file/xY7f"), ["figma.com/xY7f"]);
  eq("a bare host is just the host", labels("https://kua.quebec"), ["kua.quebec"]);
  check("a long identifier is cut",
        labels("https://kua.quebec/" + "a".repeat(60))[0].endsWith("…"),
        labels("https://kua.quebec/" + "a".repeat(60))[0]);
}

/*
  Whatever holds session state registers how to drop it, and the sign-out button
  asks without knowing who answered. That inversion exists for a reason worth
  keeping: the button also renders on /no-access, and importing the store from
  it put seventeen kilobytes of task machinery on a page whose whole job is one
  line of copy and a way out.
*/
section("Sign-out — everything registered is dropped");
{
  const dropped = [];

  const forgetA = reset.onSignOut(() => dropped.push("store"));
  reset.onSignOut(() => dropped.push("drafts"));

  reset.resetSession();
  eq("both ran", dropped.sort(), ["drafts", "store"]);

  dropped.length = 0;
  forgetA();
  reset.resetSession();
  eq("an unregistered one does not", dropped, ["drafts"]);

  /*
    One throwing must not leave the rest holding the previous person's data, and
    none of them is worth failing a sign-out for.
  */
  dropped.length = 0;
  reset.onSignOut(() => { throw new Error("boom"); });
  reset.onSignOut(() => dropped.push("after the thrower"));
  let threw = false;
  try {
    reset.resetSession();
  } catch {
    threw = true;
  }
  check("a thrower does not stop the others", dropped.includes("after the thrower"),
        dropped.join(","));
  check("and does not escape", threw === false);
}

/*
  Arrow keys in the date picker. Home and End are the two that are easy to get
  one day wrong, and one day wrong in a date picker is a task due on the wrong
  day — the picker exists precisely for the cases where the exact date matters.

  Weeks start on Monday here, and date-fns counts from Sunday, which is where
  the off-by-one would come from.
*/
section("Date picker — where an arrow key lands");
{
  // 2026-09-10 is a Thursday
  const thursday = "2026-09-10";
  eq("left is the day before", time.stepInGrid(thursday, "left"), "2026-09-09");
  eq("right is the day after", time.stepInGrid(thursday, "right"), "2026-09-11");
  eq("up is the week before", time.stepInGrid(thursday, "up"), "2026-09-03");
  eq("down is the week after", time.stepInGrid(thursday, "down"), "2026-09-17");
  eq("Home is the Monday of that week", time.stepInGrid(thursday, "weekStart"),
     "2026-09-07");
  eq("End is the Sunday", time.stepInGrid(thursday, "weekEnd"), "2026-09-13");

  // Monday is already the start; Sunday is already the end
  eq("Home on a Monday does not move", time.stepInGrid("2026-09-07", "weekStart"),
     "2026-09-07");
  eq("End on a Sunday does not move", time.stepInGrid("2026-09-13", "weekEnd"),
     "2026-09-13");
  eq("Home on a Sunday goes back six days, not forward one",
     time.stepInGrid("2026-09-13", "weekStart"), "2026-09-07");

  // stepping off the end of a month, of a year, and across a DST boundary
  eq("left off the first of the month", time.stepInGrid("2026-09-01", "left"),
     "2026-08-31");
  eq("down off the end of the year", time.stepInGrid("2026-12-28", "down"),
     "2027-01-04");
  eq("across the spring change", time.stepInGrid("2026-03-08", "left"), "2026-03-07");
  eq("across the autumn change", time.stepInGrid("2026-11-01", "left"), "2026-10-31");
  eq("and a leap day", time.stepInGrid("2028-03-01", "left"), "2028-02-29");

  // every step lands somewhere the grid can actually show
  let bad = [];
  const base = time.toDate("2026-01-01");
  const { addDays } = await import("date-fns");
  for (let i = 0; i < 365; i += 1) {
    const day = time.toDayString(addDays(base, i));
    for (const step of ["left", "right", "up", "down", "weekStart", "weekEnd"]) {
      const landed = time.stepInGrid(day, step);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(landed)) bad.push(day + " " + step + " -> " + landed);
    }
  }
  check("2190 steps across a year all land on a real day", bad.length === 0,
        bad.slice(0, 2).join(" | "));
}

/*
  § 8.2 asks for the uncheck tone to be « a fifth below the root, never part of
  the run », which is one sentence making two claims. The implementation was -5
  semitones and satisfied neither: a fifth below is seven, and -5 lands on G,
  which is degree 7 of the scale the run climbs — so the tone meant to sound
  unlike a completion was a completion note an octave down.

  It is consonant either way, which is why nothing ever sounded wrong. Checkable
  without audio, though, because both claims are arithmetic.
*/
section("Sound — the uncheck tone is outside the run");
{
  const { SCALE, UNCHECK_SEMITONES } = sound;

  eq("a fifth below the root is seven semitones", UNCHECK_SEMITONES, -7);

  // pitch classes, so an octave down does not disguise a scale note
  const inScale = new Set(SCALE.map((n) => ((n % 12) + 12) % 12));
  const uncheck = ((UNCHECK_SEMITONES % 12) + 12) % 12;
  check("and its pitch class is not one the run uses", !inScale.has(uncheck),
        `uncheck ${uncheck}, scale {${[...inScale].sort((a, b) => a - b)}}`);

  // the old value, kept as a test so the mistake cannot come back quietly
  const oldUncheck = ((-5 % 12) + 12) % 12;
  check("the previous value was in the scale, which is the bug",
        inScale.has(oldUncheck), `-5 -> pitch class ${oldUncheck}`);

  check("the run itself is pentatonic — five pitch classes", inScale.size === 5,
        `${inScale.size}`);
  eq("and it climbs ten notes before it stops", SCALE.length, 10);
}

/*
  What an open editor still owes the task.

  The modal debounces its three text fields, so closing has to save whatever has
  not been written yet — there is no Cancel in it, so leaving is not discarding.
  It used to cancel instead: the debounce cleared its own timer on unmount, and a
  note typed and escaped inside 400ms was gone with nothing to say so. That was
  always reachable and became the main path the day the composer grew a
  Shift+Enter whose whole purpose is "open it, type a note, leave".
*/
section("Editor — closing saves what was typed, and only that");
{
  const saved = { title: "Appeler le client", notes: null, label: null };
  const buf = (over) => ({ id: "t1", title: saved.title, notes: "", label: "", ...over });

  eq("an untouched buffer owes nothing", textPatch(buf(), saved), null);

  eq("a note typed inside the debounce window is still owed",
     textPatch(buf({ notes: "rappeler apres 15h" }), saved),
     { notes: "rappeler apres 15h" });

  eq("so is a label, which used to save on blur and never fired on Esc",
     textPatch(buf({ label: "acme" }), saved), { label: "acme" });

  eq("everything at once arrives as one patch, not three",
     textPatch(buf({ title: "Appeler Marie", notes: "n", label: "l" }), saved),
     { title: "Appeler Marie", notes: "n", label: "l" });

  /*
    An emptied title box is a rewrite in progress, not an instruction. Select-all
    then type passes through empty on every edit, and obeying it would blank the
    row in the list behind the modal each time.
  */
  eq("an emptied title is not an instruction to delete the title",
     textPatch(buf({ title: "   " }), saved), null);

  eq("but emptied notes really do clear",
     textPatch(buf({ notes: "" }), { ...saved, notes: "quelque chose" }),
     { notes: null });

  eq("and so does an emptied label",
     textPatch(buf({ label: "  " }), { ...saved, label: "acme" }),
     { label: null });

  eq("whitespace around a label is not a change",
     textPatch(buf({ label: " acme " }), { ...saved, label: "acme" }), null);

  // a deleted task has nowhere to save to — the delete button closes the modal
  eq("a task deleted while open is not resurrected",
     textPatch(buf({ notes: "trop tard" }), undefined), null);

  eq("and neither is one with no owner recorded",
     textPatch({ id: "", title: "x", notes: "y", label: "" }, saved), null);

  /*
    The guard that makes a flush safe at all. Switching tasks renders the new id
    with the old buffers for exactly one commit; pairing them outside the buffer
    would write these notes onto that task.
  */
  const other = { title: "Autre tache", notes: null, label: null };
  eq("the buffer carries its own owner, so a mismatch cannot be expressed",
     textPatch({ id: "t1", title: "x", notes: "les notes de t1", label: "" }, other),
     { title: "x", notes: "les notes de t1" });
}

/*
  The checkmark's geometry.

  § 8.1: "The checkmark DRAWS, it does not appear. That distinction is most of
  the effect." The draw is a `stroke-dashoffset` animation from the path's
  length to zero, so the declared length has to be the path's actual length. It
  was not — 13.2 against a real 10.879 — which meant the dash was 21% longer
  than the stroke and the last 17.6% of every draw had nothing left to draw.

  Nothing about that failure is visible in code review: two plausible numbers
  sitting next to each other, one of them wrong. So the length is derived from
  the points, and this checks the derivation against the geometry independently.
*/
section("Checkmark — the dash length is the path length");
{
  const pts = motion.CHECK_POINTS;
  const byHand = pts.reduce(
    (t, [x, y], i) => (i === 0 ? 0 : t + Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1])),
    0,
  );

  check("the declared length is the real one", Math.abs(motion.CHECK_LENGTH - byHand) < 1e-9,
        `${motion.CHECK_LENGTH} vs ${byHand}`);

  // the value that was there before, kept as a test so it cannot come back
  check("and it is not the 13.2 that used to be written there",
        Math.abs(motion.CHECK_LENGTH - 13.2) > 1,
        String(motion.CHECK_LENGTH));

  check("the path string still starts at the first point",
        motion.CHECK_PATH.startsWith(`M${pts[0][0]} ${pts[0][1]}`), motion.CHECK_PATH);

  check("and names every point exactly once",
        motion.CHECK_PATH.split(/[ML]/).filter(Boolean).length === pts.length,
        motion.CHECK_PATH);

  /*
    The tick has to fit the box it is drawn in: a 14px viewBox inside an 18px
    button. A coordinate outside it would be clipped, and a clipped checkmark
    reads as a rendering bug rather than as a tick.
  */
  check("every point is inside the 14px viewBox",
        pts.every(([x, y]) => x >= 0 && x <= 14 && y >= 0 && y <= 14),
        JSON.stringify(pts));

  /*
    § 8.1 gives the draw 60ms of delay then the draw itself, and § 8.9 moved the
    duration to 220. The whole sequence has to finish inside the hold, or the row
    leaves while the tick it is showing is still being drawn.
  */
  const drawEnds = motion.COMPLETION.checkDrawDelay + motion.COMPLETION.checkDrawDuration;
  check("the draw finishes before the row collapses",
        drawEnds < motion.COMPLETION.holdBeforeCollapse,
        `${drawEnds}ms draw vs ${motion.COMPLETION.holdBeforeCollapse}ms hold`);

  check("so does the ripple",
        motion.COMPLETION.ripple < motion.COMPLETION.holdBeforeCollapse,
        `${motion.COMPLETION.ripple}ms`);

  // § 8.1: the hold "is almost certainly between 700 and 1100"
  check("the hold is inside the range 8.1 predicts",
        motion.COMPLETION.holdBeforeCollapse >= 700 && motion.COMPLETION.holdBeforeCollapse <= 1100,
        `${motion.COMPLETION.holdBeforeCollapse}ms`);

  // docs/04: nothing user-triggered exceeds 260ms
  for (const [name, ms] of Object.entries(motion.COMPLETION)) {
    if (name === "holdBeforeCollapse" || name === "ripple") continue;
    check(`${name} is inside the 260ms ceiling`, ms <= 260, `${ms}ms`);
  }
}

/*
  What a search query means.

  Search was one substring test over title + label + notes joined together, so
  `#facture` and `facture` asked the same question and neither asked "tasks
  tagged facture". Clicking a label chip fills the box with `#facture` and reads
  as « show me this tag » — and it returned every task merely mentioning the word
  in its notes. With four tasks that passes for working; with a client's name
  used in both a title and a label it stops being a filter.
*/
section("Search — a tag filters, text finds, and together they narrow");
{
  const { parseQuery, matches } = search;
  const hit = (q, t) => matches(t, parseQuery(q));

  const tagged = { title: "envoyer le devis", label: "facture", notes: null };
  const mentions = { title: "appeler le client", label: "acme", notes: "au sujet de la facture" };
  const neither = { title: "refaire le site", label: null, notes: null };
  const accented = { title: "étiquette à revoir", label: "Étiquette", notes: null };

  eq("a tag is parsed out of the query", parseQuery("#facture"), { tag: "facture", text: "" });
  eq("and the rest stays as text", parseQuery("#facture client"),
     { tag: "facture", text: "client" });
  eq("a tag can arrive after the words", parseQuery("client #facture"),
     { tag: "facture", text: "client" });
  eq("a bare # names no tag", parseQuery("#"), { tag: null, text: "#" });
  eq("and a second one is just text", parseQuery("#a #b"), { tag: "a", text: "#b" });

  check("#tag finds the task carrying it", hit("#facture", tagged));
  check("and not one that merely mentions the word", !hit("#facture", mentions));
  check("text alone still finds both",
        hit("facture", tagged) && hit("facture", mentions));
  check("text alone finds neither of the unrelated", !hit("facture", neither));

  /*
    Prefix, not equality: the query is being typed, and results narrowing on
    the way to `#facture` is what tells you the tag exists at all.
  */
  check("a half-typed tag still matches", hit("#fac", tagged));
  check("but not a tag it is not a prefix of", !hit("#ture", tagged));

  check("tag and text are ANDed", !hit("#facture client", tagged));
  check("and both together match when both hold",
        hit("#acme client", mentions));

  // accents and case, on both sides of the comparison
  check("a tag matches regardless of case", hit("#etiquette", accented));
  check("and regardless of accents", hit("#étiquette", accented));
  check("text is accent-insensitive too", hit("etiquette", accented));

  check("an empty query matches nothing", !hit("", tagged));
  check("whitespace is not a query", !hit("   ", tagged));
}

/*
  The best run, which is a different question from the current one.

  `streakFromDays` walks back from today and goes to zero the day after a streak
  breaks. A record has to survive that, so it looks for the longest run anywhere
  in the history and never depends on what day it is.
*/
section("Longest streak — the best run anywhere, not the one ending today");
{
  const { longestStreakFromDays: longest } = time;

  eq("no history is no streak", longest([]), 0);
  eq("a single day is a run of one", longest(["2026-06-16"]), 1);

  eq("consecutive days count",
     longest(["2026-06-16", "2026-06-17", "2026-06-18"]), 3);

  eq("order does not matter",
     longest(["2026-06-18", "2026-06-16", "2026-06-17"]), 3);

  eq("a repeated day is still one day",
     longest(["2026-06-16", "2026-06-16", "2026-06-17"]), 2);

  eq("a gap ends the run",
     longest(["2026-06-16", "2026-06-17", "2026-06-19"]), 2);

  eq("and the longest of several wins",
     longest(["2026-06-01", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-09"]), 3);

  /*
    The record does not care about today, which is the whole difference. These
    days are long past and still count.
  */
  eq("a run that ended months ago still counts",
     longest(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]), 4);

  // month and year boundaries are where naive date arithmetic fails
  eq("a run across a month boundary is unbroken",
     longest(["2026-01-30", "2026-01-31", "2026-02-01"]), 3);
  eq("a run across a year boundary is unbroken",
     longest(["2025-12-31", "2026-01-01"]), 2);
  eq("and across a leap day",
     longest(["2028-02-28", "2028-02-29", "2028-03-01"]), 3);

  /*
    Spring forward is the case that breaks anything doing UTC arithmetic on
    dates: 2026-03-08 is 23 hours long in Montreal.
  */
  eq("a DST day does not break the run",
     longest(["2026-03-07", "2026-03-08", "2026-03-09"]), 3);
}

/*
  How many tasks a day shows in the month grid.

  A promise to the people using this — "at least five, then « +2 »" — and one
  got wrong twice from opposite directions: once by capping the count at a
  constant that ignored the window, and once by sizing the grid's rows in a way
  that never reached the cells. Both times the app looked fine and showed one
  task a day, which is why this is a number rather than a judgement.
*/
section("Calendar — a month cell shows the days it promised");
{
  const { cardsPerCell, CELL_MIN_HEIGHT, CELL_CHROME, CARD_PITCH } = calendar;

  check("a cell at its minimum shows at least five", cardsPerCell() >= 5,
        `${cardsPerCell()} cards in ${CELL_MIN_HEIGHT}px`);

  // a taller window earns more, which is the point of measuring rather than capping
  check("a taller cell shows more", cardsPerCell(CELL_MIN_HEIGHT * 2) > cardsPerCell(),
        `${cardsPerCell(CELL_MIN_HEIGHT * 2)} at double height`);

  /*
    Never zero. A cell short enough to fit nothing would render as a date and a
    « +3 » with no tasks under it, which is worse than showing one and hiding
    the rest.
  */
  check("and a cell too short for any still shows one", cardsPerCell(10) === 1,
        String(cardsPerCell(10)));

  check("the chrome is smaller than the cell it sits in", CELL_CHROME < CELL_MIN_HEIGHT,
        `${CELL_CHROME} of ${CELL_MIN_HEIGHT}`);
  check("and a card is smaller than the chrome", CARD_PITCH < CELL_CHROME,
        `${CARD_PITCH} vs ${CELL_CHROME}`);
}

/*
  The route table, which four things now read.

  The rail, the command palette, the `g` sequence and the shortcut sheet all
  come from one list — they did not, and every route added after the first four
  was wired into the rail and forgotten elsewhere: /activity, /stats and /notes
  were each missing from the palette, and two of the three had no shortcut at
  all. One list fixes that. What one list cannot fix by itself is two entries
  claiming the same key, which costs a route its keyboard path and shows
  nothing — `g` simply lands on whichever the object enumerated last.
*/
section("Routes — one table, and no two claim the same key");
{
  const { ROUTES, RESERVED_SEQUENCE_KEYS } = routes;

  const keys = ROUTES.map((r) => r.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  check("no two routes share a g key", dupes.length === 0, dupes.join(", ") || "none");

  check("and none takes one that is already spoken for",
        keys.every((k) => !RESERVED_SEQUENCE_KEYS.includes(k)),
        keys.filter((k) => RESERVED_SEQUENCE_KEYS.includes(k)).join(", ") || "none");

  check("every key is a single letter",
        keys.every((k) => /^[a-z]$/.test(k)), keys.join(","));

  const hrefs = ROUTES.map((r) => r.href);
  check("no route is listed twice",
        new Set(hrefs).size === hrefs.length, hrefs.join(", "));

  // the palette matches on these, so an empty one is a route nobody can find
  check("every route has something to search it by",
        ROUTES.every((r) => r.keywords.trim().length > 0 && r.label.trim().length > 0));

  /*
    A route's own label should be findable by its keywords. Typing the name of
    the thing you can see in the rail is the first thing anybody tries.
  */
  check("and its keywords include its own name",
        ROUTES.every((r) =>
          r.keywords.toLowerCase().includes(r.label.toLowerCase().slice(0, 4)),
        ),
        ROUTES.filter((r) => !r.keywords.toLowerCase().includes(r.label.toLowerCase().slice(0, 4)))
          .map((r) => r.label)
          .join(", ") || "all fine");
}

/*
  The six colours, which live in two places that cannot import each other.

  ACCENTS is a client component's export; the CHECK constraint is SQL. Both the
  profile picker and the task colour picker iterate ACCENTS, so adding a seventh
  entry there puts it on screen immediately — and the insert then fails the
  constraint. Optimistically, which is the bad way: the colour paints, the write
  is rejected, and the task reverts a beat later with nothing said. Reading both
  as text is crude, but it is the only place the two can be compared at all.
*/
section("Colours — the picker offers what the database accepts");
{
  const dot = fs.readFileSync("components/task/assignee-dot.tsx", "utf8");
  const block = dot.slice(
    dot.indexOf("export const ACCENTS"),
    dot.indexOf("};", dot.indexOf("export const ACCENTS")),
  );
  const offered = [...block.matchAll(/^\s{2}([a-z]+):/gm)].map((m) => m[1]);

  const sql = fs.readFileSync("supabase/migrations/0020_task_color.sql", "utf8");
  const list = sql.slice(sql.indexOf("color in ("), sql.indexOf(")", sql.indexOf("color in (")));
  const accepted = [...list.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);

  check("six of them", offered.length === 6, offered.join(","));
  check(
    "and the constraint takes exactly those",
    offered.length === accepted.length && offered.every((c) => accepted.includes(c)),
    `picker ${offered.join(",")} vs sql ${accepted.join(",")}`,
  );
  check(
    "every one is a hex the CSS can use",
    [...block.matchAll(/"(#[0-9a-f]{6})"/g)].length === offered.length,
  );
}

section("Nouveau — three hours, then it is just a task");
{
  const { isFresh, FRESH_FOR_MS } = fresh;
  const t0 = Date.parse("2026-09-22T14:00:00Z");
  const at = new Date(t0).toISOString();
  check("new the moment it is created", isFresh(at, t0));
  check("still new a minute before three hours", isFresh(at, t0 + FRESH_FOR_MS - 60_000));
  check("not new at three hours", !isFresh(at, t0 + FRESH_FOR_MS));
  check("a clock slightly ahead reads as just now", isFresh(at, t0 - 5_000));
  check("no timestamp is never new", !isFresh(null, t0) && !isFresh("", t0));
  check("garbage is never new", !isFresh("not a date", t0));
  check("an unknown time (the server render) is never new", !isFresh(at, null));
}

/*
  Billing. The page replaces a spreadsheet, so the rows below are the
  spreadsheet: the GCSM tab, as it was shared. If these disagree with it, the
  page is wrong, not the sheet.
*/
section("Facturation — the page agrees with the sheet it replaces");
{
  const { amountOf, totals, parseAmount, formatMoney, DEFAULT_RATE } = billing;
  const row = (o) => ({ hours: null, rate: null, amount: null, status: "pending", ...o });

  check("the default rate is the sheet's 75", DEFAULT_RATE === 75);
  check("3 h at 150 is 450 (« 3 Pages service »)", amountOf(row({ hours: 3, rate: 150 }), 75) === 450);
  check("hours with no rate take the client's", amountOf(row({ hours: 2 }), 75) === 150);
  check("a fixed price wins over hours × rate", amountOf(row({ hours: 3, rate: 150, amount: 2500 }), 75) === 2500);
  check("a fixed zero is zero, not « compute it »", amountOf(row({ hours: 3, amount: 0 }), 75) === 0);
  check("nothing yet is zero", amountOf(row({}), 75) === 0);
  check("rounded to the cent", amountOf(row({ hours: 1.333, rate: 75 }), 75) === 99.98);

  const gcsm = [
    row({ amount: 2500, status: "paid" }),
    row({ amount: 250, status: "paid" }),
    row({ amount: 750, status: "paid" }),
    row({ amount: 2500 }),
    row({ hours: 3, rate: 150 }),
    row({ amount: 800, status: "invoiced" }),
  ];
  const t = totals(gcsm, 75);
  check("paid is 3 500", t.paid === 3500, String(t.paid));
  check("to invoice is 2 950", t.pending === 2950, String(t.pending));
  check("outstanding is to-invoice plus invoiced", t.outstanding === 3750, String(t.outstanding));
  check("all of it adds up", t.all === 7250, String(t.all));

  check("« 2,5 » is 2.5", parseAmount("2,5") === 2.5);
  check("« 2.5 » is 2.5", parseAmount("2.5") === 2.5);
  check("« 2 500,00 $ » is 2500", parseAmount("2 500,00 $") === 2500);
  check("« 2\u00a0500,00\u00a0$ » (a pasted fr-CA figure) is 2500", parseAmount("2\u00a0500,00\u00a0$") === 2500);
  check("« $2,500.00 » is 2500", parseAmount("$2,500.00") === 2500);
  check("« 3h » is 3", parseAmount("3h") === 3);
  check("empty is null, which means compute it", parseAmount("  ") === null);
  check("words are refused, not zeroed", parseAmount("abc") === undefined);
  check("negative is refused", parseAmount("-5") === undefined);
  check("what we print, we can read back", parseAmount(formatMoney(2950.5)) === 2950.5, formatMoney(2950.5));
}

section("Facturation — pasting the sheet in");
{
  const { parseSheetPaste, parseDay, parseStatus, parseTsv } = billing;

  // what Excel puts on the clipboard for three rows of the GCSM tab
  const clip =
    '24/07/2026\tForfait Propriétaire - (50% avant)\t"-Design et programmation\n-Site Web Mobile"\t\t\t$2,500.00\tPayé\r\n' +
    "24/07/2026\t3 Pages service\t\t3.00\t$150\t$450.00\t\r\n" +
    "24/07/2026\tPages SEO\t- 12 pages localisations\t\t\t$800.00\t\r\n";
  const rows = parseSheetPaste(clip, "2026-09-22");

  check("three rows come out", rows?.length === 3, String(rows?.length));
  check("the date is read day-first", rows?.[0].entry_on === "2026-07-24");
  check(
    "a quoted multi-line Détail stays one cell",
    rows?.[0].detail === "-Design et programmation\n-Site Web Mobile",
    JSON.stringify(rows?.[0].detail),
  );
  check("a fixed price stays fixed", rows?.[0].amount === 2500 && rows?.[0].hours === null);
  check("Payé is paid", rows?.[0].status === "paid");
  check(
    "3 h × 150 = 450 is stored as computed, not as a price",
    rows?.[1].hours === 3 && rows?.[1].rate === 150 && rows?.[1].amount === null,
  );
  check("a blank status is à facturer", rows?.[2].status === "pending");

  check(
    "the header row is skipped",
    parseSheetPaste("Date\tTâche\tDétail\n24/07/2026\tX\t", "2026-09-22")?.length === 1,
  );
  check(
    "a missing date is today's",
    parseSheetPaste("\tX\t\t\t\t10\t", "2026-09-22")?.[0].entry_on === "2026-09-22",
  );
  check("one plain cell is not an import", parseSheetPaste("just text", "2026-09-22") === null);
  check("doubled quotes inside a cell are one quote", parseTsv('"a ""b"" c"\tx')[0][0] === 'a "b" c');

  check("12/04/2025 is 12 April", parseDay("12/04/2025") === "2025-04-12");
  check("ISO passes through", parseDay("2026-07-24") === "2026-07-24");
  check("two-digit years are this century", parseDay("24/07/26") === "2026-07-24");
  check("31/02 is refused, not rolled into March", parseDay("31/02/2026") === null);
  check(
    "Facturé, facture, invoiced all read as invoiced",
    ["Facturé", "facture", "Invoiced"].every((s) => parseStatus(s) === "invoiced"),
  );
  check("paye without the accent is paid", parseStatus("paye") === "paid");
}

section("Facturation — the invoice text pastes into QuickBooks as written");
{
  const { invoiceText } = billing;
  const line = (o) => ({ hours: null, rate: null, amount: null, status: "pending", detail: "", ...o });
  const text = invoiceText(
    "GCSM",
    [
      line({ entry_on: "2026-07-24", title: "Pages SEO", detail: "- 12 pages localisations", amount: 800 }),
      line({ entry_on: "2026-07-24", title: "3 Pages service", hours: 3, rate: 150 }),
      line({ entry_on: "2026-07-20", title: "Forfait (50% apres)", detail: "-Design\n-8 pages\n", amount: 2500 }),
    ],
    75,
    "à facturer",
    { subtotal: "Sous-total", gst: "TPS", qst: "TVQ", total: "Total avec taxes" },
  );
  const lines = text.split("\n");

  check("it opens with the client", lines[0] === "GCSM — à facturer", lines[0]);
  check("oldest line first", lines[2].startsWith("Forfait (50% apres)"), lines[2]);
  check("detail is indented under its line", lines[3] === "    -Design" && lines[4] === "    -8 pages");
  check("a blank detail line is dropped", !lines.includes("    "));
  check("hours show how the amount was made", text.includes("3 Pages service — 3 h × 150 $ = 450,00"), text);
  check("a fixed price shows only the price", /Pages SEO — 800,00\s\$/.test(text));
  check("the subtotal is the sum of the lines", /Sous-total : 3\s750,00\s\$/.test(text), text);
  check(
    "the two taxes are spelled out",
    /TPS 5 % : 187,50\s\$/.test(text) && /TVQ 9,975 % : 374,06\s\$/.test(text),
    text,
  );
  check("and the total is what the client pays", /Total avec taxes : 4\s311,56\s\$$/.test(text), lines.at(-1));
  check("an untitled line still reads", invoiceText("X", [line({ entry_on: "2026-01-01", title: "", amount: 5 })], 75, "h", {
    subtotal: "S",
    gst: "TPS",
    qst: "TVQ",
    total: "T",
  }).includes("— — 5,00"));
}

/*
  « Nous deux ». A task belongs to one of you, both of you, or nobody, and the
  two fields that say so (assignee_id, shared) are exclusive — the database
  refuses a row that is both, so nothing here may produce one.
*/
section("Assignation — someone's, both people's, or nobody's");
{
  const { isAssignedTo, matchesFilter, assignmentOf, assign, BOTH } = assignee;
  const ME = "u1";
  const YOU = "u2";
  const mine = { assignee_id: ME, shared: false };
  const ours = { assignee_id: null, shared: true };
  const nobodys = { assignee_id: null, shared: false };

  check("your task is yours", isAssignedTo(mine, ME) && !isAssignedTo(mine, YOU));
  check("a shared task is both of yours", isAssignedTo(ours, ME) && isAssignedTo(ours, YOU));
  check("nobody's is nobody's", !isAssignedTo(nobodys, ME) && !isAssignedTo(nobodys, YOU));

  check("the lens off shows everything", [mine, ours, nobodys].every((t) => matchesFilter(t, null)));
  check(
    "« Moi » includes what is both of yours",
    matchesFilter(mine, ME) && matchesFilter(ours, ME) && !matchesFilter(nobodys, ME),
  );
  check(
    "and so does your partner's lens — a shared task hides from neither",
    matchesFilter(ours, YOU) && !matchesFilter(mine, YOU),
  );

  check("a picker reads the state back", assignmentOf(mine) === ME && assignmentOf(ours) === BOTH && assignmentOf(nobodys) === null);

  check("choosing a person clears shared", JSON.stringify(assign(ME)) === JSON.stringify({ assignee_id: ME, shared: false }));
  check("choosing both clears the person", JSON.stringify(assign(BOTH)) === JSON.stringify({ assignee_id: null, shared: true }));
  check("choosing nobody clears both", JSON.stringify(assign(null)) === JSON.stringify({ assignee_id: null, shared: false }));
  check(
    "no patch ever names a person and both at once",
    [ME, YOU, BOTH, null].every((c) => {
      const p = assign(c);
      return !(p.shared && p.assignee_id !== null);
    }),
  );
}

section("Compositeur — « @nous » assigns to both");
{
  const { composeTask } = await load("compose.ts");
  const members = [
    { id: "u1", display_name: "William", email: "w@kua.quebec" },
    { id: "u2", display_name: "Gab", email: "gberther@kua.quebec" },
  ];
  const make = (v) => composeTask({ value: v, dismissed: new Set(), members });

  const both = make("Appeler le comptable @nous");
  check("« @nous » is shared", both.shared === true && both.assignee_id === null);
  check("and the handle leaves the title", both.title === "Appeler le comptable", both.title);
  check("« @tous » too", make("Ranger @tous").shared === true);
  check("a person is still a person", make("Ranger @William").assignee_id === "u1" && make("Ranger @William").shared === false);
  check("a short handle stays a name, not a guess", make("Ranger @no").shared === false);
  check("no handle, no sharing", make("Ranger").shared === false);
}

section("Facturation — the client list sorts by the column you click");
{
  const { sortClients, nextSort } = billing;
  const c = (name, o = {}) => ({
    name,
    archived: false,
    activity: "2026-01-01",
    last: null,
    pending: 0,
    invoiced: 0,
    paid: 0,
    outstanding: 0,
    ...o,
  });
  const rows = [
    c("GCSM", { pending: 3750, outstanding: 3750, last: "2026-07-24", activity: "2026-07-24", paid: 3500 }),
    c("AXUM", { invoiced: 753.75, outstanding: 753.75, last: "2026-08-17", activity: "2026-08-17" }),
    c("Bégin", { invoiced: 300, outstanding: 300, last: "2026-06-18", activity: "2026-06-18" }),
    c("test", { activity: "2026-09-22" }),
    c("Vieux client", { archived: true, paid: 100, activity: "2025-01-01", last: "2025-01-01" }),
  ];
  const names = (r) => r.map((x) => x.name);

  check(
    "no sort: what is owed, then what moved last",
    names(sortClients(rows, null)).join(",") === "GCSM,AXUM,Bégin,test,Vieux client",
    names(sortClients(rows, null)).join(","),
  );

  check(
    "by name ascending is alphabetical",
    names(sortClients(rows, { key: "name", dir: "asc" })).join(",") ===
      "AXUM,Bégin,GCSM,test,Vieux client",
    names(sortClients(rows, { key: "name", dir: "asc" })).join(","),
  );
  check(
    "and descending is its mirror",
    names(sortClients(rows, { key: "name", dir: "desc" })).join(",") ===
      "Vieux client,test,GCSM,Bégin,AXUM",
  );

  check(
    "by Facturé, largest first",
    names(sortClients(rows, { key: "invoiced", dir: "desc" })).slice(0, 2).join(",") === "AXUM,Bégin",
  );
  check(
    "by Facturé ascending, smallest first — but the empty ones stay at the bottom",
    names(sortClients(rows, { key: "invoiced", dir: "asc" })).join(",") ===
      "Bégin,AXUM,GCSM,test,Vieux client",
    names(sortClients(rows, { key: "invoiced", dir: "asc" })).join(","),
  );

  check(
    "by Payé",
    names(sortClients(rows, { key: "paid", dir: "desc" })).slice(0, 2).join(",") === "GCSM,Vieux client",
  );

  check(
    "by Dernière entrée, newest first",
    names(sortClients(rows, { key: "last", dir: "desc" })).slice(0, 2).join(",") === "AXUM,GCSM",
    names(sortClients(rows, { key: "last", dir: "desc" })).join(","),
  );
  check(
    "a client with no line yet has no last entry, so it sorts last either way",
    names(sortClients(rows, { key: "last", dir: "asc" })).at(-1) === "test",
    names(sortClients(rows, { key: "last", dir: "asc" })).join(","),
  );

  check(
    "by Statut, the first click puts the active ones first",
    names(sortClients(rows, { key: "status", dir: "desc" })).at(-1) === "Vieux client",
    names(sortClients(rows, { key: "status", dir: "desc" })).join(","),
  );
  check(
    "and the second puts the archived ones first",
    names(sortClients(rows, { key: "status", dir: "asc" }))[0] === "Vieux client",
  );

  check("ties fall back to the name, so the list never shuffles",
        names(sortClients(rows, { key: "pending", dir: "desc" })).slice(1).join(",") ===
          "AXUM,Bégin,test,Vieux client");

  check("sorting does not mutate what it was given", names(rows)[0] === "GCSM");

  check("a first click sorts down", JSON.stringify(nextSort(null, "paid")) === JSON.stringify({ key: "paid", dir: "desc" }));
  check("a second click sorts up", JSON.stringify(nextSort({ key: "paid", dir: "desc" }, "paid")) === JSON.stringify({ key: "paid", dir: "asc" }));
  check("a third gives the default order back", nextSort({ key: "paid", dir: "asc" }, "paid") === null);
  check("another column starts over", JSON.stringify(nextSort({ key: "paid", dir: "asc" }, "name")) === JSON.stringify({ key: "name", dir: "desc" }));
}

section("Facturation — Quebec's two taxes, beside the money rather than inside it");
{
  const { taxesOn, formatRate, GST_RATE, QST_RATE, totals } = billing;

  check("the rates are Quebec's", GST_RATE === 0.05 && QST_RATE === 0.09975);

  const t = taxesOn(1000);
  check("GST on 1 000 is 50", t.gst === 50, String(t.gst));
  check("QST on 1 000 is 99,75", t.qst === 99.75, String(t.qst));
  check("and the client pays 1 149,75", t.total === 1149.75, String(t.total));
  check(
    "QST is not charged on the GST — Quebec stopped compounding in 2013",
    taxesOn(100).qst === 9.98,
    String(taxesOn(100).qst),
  );

  const gcsm = taxesOn(3750);
  check("GCSM's 3 750 to invoice is 4 311,56 with tax", gcsm.total === 4311.56, String(gcsm.total));
  check("each tax is rounded on its own, as an invoice prints them",
        gcsm.gst === 187.5 && gcsm.qst === 374.06, `${gcsm.gst} / ${gcsm.qst}`);
  check("nothing owed, nothing taxed", taxesOn(0).total === 0);

  /*
    The one that matters: tax is never income. The totals the dashboard shows
    come from the rows, and the rows are before tax — so adding the tax view
    must not have moved them.
  */
  const rows = [
    { hours: null, rate: null, amount: 1000, status: "paid" },
    { hours: null, rate: null, amount: 500, status: "pending" },
  ];
  check("the sums stay before tax", totals(rows, 75).paid === 1000 && totals(rows, 75).pending === 500);

  check("the rate prints as Quebec writes it", formatRate(QST_RATE) === "9,975 %", formatRate(QST_RATE));
  check("and a round one prints short", formatRate(GST_RATE) === "5 %", formatRate(GST_RATE));
}

section("Facturation — a line that says nothing is not activity");
{
  const { isBlankEntry } = billing;
  const row = (o) => ({ title: "", detail: "", hours: null, rate: null, amount: null, ...o });

  check("the row « Ajouter une ligne » writes is blank", isBlankEntry(row()));
  check("a title makes it real", !isBlankEntry(row({ title: "Pages SEO" })));
  check("so does a detail on its own", !isBlankEntry(row({ detail: "12 pages" })));
  check("so do hours", !isBlankEntry(row({ hours: 1 })));
  check("so does a price", !isBlankEntry(row({ amount: 0 })), "a typed zero is a decision");
  check("and so does a rate typed alone", !isBlankEntry(row({ rate: 150 })));
  check("whitespace is still nothing", isBlankEntry(row({ title: "   ", detail: " " })));
}

section("Récurrence — a task that comes back, counted from the day it was due");
{
  const { nextOccurrence, nextFrom, isRecurrence, RECURRENCES } = recurrence;

  // 2026-09-25 is a Friday
  check("chaque jour", nextOccurrence("daily", "2026-09-25") === "2026-09-26");
  check("chaque semaine", nextOccurrence("weekly", "2026-09-25") === "2026-10-02");
  check("aux deux semaines", nextOccurrence("biweekly", "2026-09-25") === "2026-10-09");
  check("chaque mois", nextOccurrence("monthly", "2026-09-25") === "2026-10-25");

  check("jours de semaine: Friday hands to Monday", nextOccurrence("weekdays", "2026-09-25") === "2026-09-28",
        nextOccurrence("weekdays", "2026-09-25"));
  check("and so does Saturday", nextOccurrence("weekdays", "2026-09-26") === "2026-09-28");
  check("Monday hands to Tuesday", nextOccurrence("weekdays", "2026-09-28") === "2026-09-29");

  check("the 31st rolls into a short month rather than past it",
        nextOccurrence("monthly", "2026-01-31") === "2026-02-28", nextOccurrence("monthly", "2026-01-31"));
  check("a leap February", nextOccurrence("monthly", "2028-01-31") === "2028-02-29",
        nextOccurrence("monthly", "2028-01-31"));

  check("late does not drift: a weekly due Monday, finished Thursday, is due next Monday",
        nextFrom("weekly", "2026-09-21", "2026-09-24") === "2026-09-28",
        nextFrom("weekly", "2026-09-21", "2026-09-24"));
  check("with no date at all it counts from the day it was done",
        nextFrom("weekly", null, "2026-09-24") === "2026-10-01");

  check("the rules are the five the database accepts",
        RECURRENCES.join(",") === "daily,weekdays,weekly,biweekly,monthly");
  check("anything else is not a rule", !isRecurrence("yearly") && !isRecurrence(null) && isRecurrence("daily"));
}

console.log(`\n${failures === 0 ? "all logic invariants hold" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
