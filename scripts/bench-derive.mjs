/**
 * What one store write costs in derived work.
 *
 *   npm run bench            # 500 tasks
 *   npm run bench 2000
 *
 * Every write replaces the tasks array, so the sidebar's counts, the streak and
 * the board's columns are all recomputed. None of that shows at ten tasks and
 * all of it is a dropped frame at two thousand, so it is worth a number rather
 * than an opinion. The rewrite of bucketOf and instantToDay was measured here:
 * at 2000 tasks these four together went from ~40ms to ~0.23ms.
 *
 * Not a test — nothing fails. It prints, and the number is the point.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const tmp = fs.mkdtempSync(".bench-tmp-");
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
for (const f of ["time.ts", "grouping.ts", "store.ts", "sound.ts", "copy.ts", "utils.ts"]) {
  const src = fs.readFileSync(path.join("lib", f), "utf8");
  fs.writeFileSync(path.join(tmp, f), src
    .replace(/from ['"]@\/lib\/supabase\/client['"]/g, 'from "./stub.ts"')
    .replace(/from ['"]@\/lib\/([a-z-]+)['"]/g, 'from "./$1.ts"'));
}
fs.writeFileSync(path.join(tmp, "stub.ts"), "export function createClient(){return{auth:{getUser:async()=>({data:{user:null}})},from:()=>({})}}");
const time = await import(pathToFileURL(path.join(tmp, "time.ts")).href);
const grouping = await import(pathToFileURL(path.join(tmp, "grouping.ts")).href);

const N = Number(process.argv[2] ?? 500);
const tasks = Array.from({ length: N }, (_, i) => ({
  id: `t${i}`, title: `tache ${i}`, status: i % 3 === 0 ? "done" : "todo",
  due_on: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
  due_time: null, assignee_id: i % 2 ? "u1" : "u2", label: null, important: false,
  position: i, completed_at: i % 3 === 0 ? `2026-09-0${(i % 9) + 1}T18:00:00Z` : null,
  completed_by: null, created_by: "u1", workspace_id: "w",
  created_at: "", updated_at: "", notes: null,
}));
const day = time.today();
const members = [{ id: "u1", display_name: "a", accent: "green" }, { id: "u2", display_name: "b", accent: "blue" }];

const bench = (name, fn) => {
  for (let i = 0; i < 200; i += 1) fn();          // warm
  const t0 = performance.now();
  for (let i = 0; i < 1000; i += 1) fn();
  const ms = (performance.now() - t0) / 1000;
  console.log(`  ${name.padEnd(34)} ${ms.toFixed(4)} ms/call`);
};

console.log(`\n${N} tasks — one store write costs each of these once:`);
bench("sidebar bucket counts", () => {
  const map = new Map();
  for (const t of tasks) {
    if (t.status === "done") continue;
    map.set(time.bucketOf(t.due_on, day), 1);
  }
  return map;
});
bench("streak from every completed_at", () => {
  const local = tasks.map((t) => t.completed_at).filter(Boolean).map(time.instantToDay);
  return time.streakFromDays(local, day);
});
bench("board columns (by person)", () =>
  grouping.buildColumns("person", tasks, members, members[0], () => "green", new Map(), day));
bench("board columns (by due)", () =>
  grouping.buildColumns("due", tasks, members, members[0], () => "green", new Map(), day));
