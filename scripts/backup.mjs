/**
 * A copy of everything, as JSON.
 *
 *   npm run backup                 # writes backups/kua-<date>.json
 *   npm run backup -- .env.prod    # against another environment
 *
 * This exists because the project is on Supabase's free plan, which has **no
 * automated backups and no point-in-time recovery**, and pauses after a week of
 * inactivity. That is fine for what this costs and not fine to be unaware of:
 * as things stand, a bad `delete` is permanent. `supabase/README.md` says so in
 * more detail.
 *
 * A dump rather than pg_dump: it needs nothing installed, runs the same on
 * Windows, and at this size — five tables, a few thousand rows at the outside —
 * JSON is a perfectly good archive that any future script can read.
 *
 * It reads with the service role key, so it sees past RLS. Treat the file the
 * way you would treat the key: it is every task both of you have ever written.
 * `backups/` is gitignored.
 */
import fs from "node:fs";
import path from "node:path";
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
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SR) {
  console.error(`missing Supabase keys in ${envPath}`);
  process.exit(2);
}

const admin = createClient(URL_, SR, { auth: { persistSession: false } });

/* Order matters on the way back in: a task needs its workspace and its author. */
const TABLES = ["workspaces", "profiles", "workspace_members", "pending_invites", "tasks"];

const dump = { taken_at: new Date().toISOString(), project: new URL(URL_).host, tables: {} };
let total = 0;

for (const table of TABLES) {
  // paged, so a table larger than PostgREST's default limit is not silently cut
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`  ${table}: ${error.message}`);
      process.exit(1);
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  dump.tables[table] = rows;
  total += rows.length;
  console.log(`  ${String(rows.length).padStart(5)}  ${table}`);
}

fs.mkdirSync("backups", { recursive: true });
const file = path.join("backups", `kua-${dump.taken_at.slice(0, 19).replace(/[:T]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(dump, null, 2));

console.log(`\n${total} rows -> ${file} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`);
console.log("auth users are NOT in here — they live in Supabase's auth schema.\n");
