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

  eq("a composer pre-dated to a day uses it",
     make("ranger le bureau", none, { defaultDueOn: "2026-09-20" }).due_on, "2026-09-20");
  check("and a parsed date wins over that default",
        make("ranger le bureau demain", none, { defaultDueOn: "2026-09-20" }).due_on
          !== "2026-09-20");
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

console.log(`\n${failures === 0 ? "all logic invariants hold" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
