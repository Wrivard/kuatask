/**
 * What a cold load actually costs, against a running deployment.
 *
 *   npm run cold                       # production
 *   npm run cold http://localhost:3000
 *
 * `docs/08-satisfaction.md` § 8.8 sets a number — "cold load to interactive
 * under 1.2s on 4G" — and nothing had ever checked it. Next's build output
 * reports "First Load JS", which is the *parsed* size and not what crosses the
 * wire; this measures the transfer, which is the thing the budget is about.
 *
 * The 4G figures are the ones Lighthouse uses for its Slow 4G preset: 1.6 Mbps
 * down and 150ms of round-trip latency. They are a convention rather than a
 * measurement of anybody's phone, which is the point — a convention can be
 * compared against itself next month.
 *
 * This is arithmetic, not a browser. It cannot see parse time, hydration, or a
 * render that blocks on something. It gives the floor: if the bytes alone do
 * not fit in the budget, nothing else needs measuring.
 */
import zlib from "node:zlib";

const base = process.argv[2] ?? "https://kuatask.vercel.app";

/*
  Which page. `/login` is the one an unauthenticated cold load hits, but its own
  comment says it is seen roughly once a month — the budget in § 8.8 is about
  the app, which is `/`. Reaching `/` needs a session, so a throwaway member is
  made and removed, the same way the other live checks do it.
*/
const path = process.argv[3] ?? "/";

/** Lighthouse's Slow 4G preset. */
const MBPS = 1.6;
const RTT_MS = 150;
const BUDGET_MS = 1200;

const bytesPerMs = (MBPS * 1_000_000) / 8 / 1000;

/** A session, when the page being measured needs one. */
let cookie = "";
let cleanup = async () => {};

if (path !== "/login") {
  const fs = await import("node:fs");
  const { createClient } = await import("@supabase/supabase-js");
  const env = Object.fromEntries(
    fs.readFileSync(".env.local", "utf8").split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = new URL(URL_).hostname.split(".")[0];
  const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const stamp = Date.now();
  const email = `kua-cold-${stamp}@example.com`;
  const PW = `Cold-${stamp}-aA1!`;
  const { data: ws } = await admin.from("workspaces").select("id").limit(1).single();
  const { data: invite } = await admin
    .from("pending_invites").insert({ workspace_id: ws.id, email, role: "member" })
    .select("id").single();
  const { data: made } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });

  cleanup = async () => {
    await admin.from("pending_invites").delete().eq("id", invite.id);
    await admin.auth.admin.deleteUser(made.user.id);
  };

  const client = createClient(URL_, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: signed } = await client.auth.signInWithPassword({ email, password: PW });
  const value = "base64-" + Buffer.from(JSON.stringify(signed.session)).toString("base64");
  const CHUNK = 3180;
  cookie = (value.length <= CHUNK
    ? [`sb-${ref}-auth-token=${value}`]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) =>
        `sb-${ref}-auth-token.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`)
  ).join("; ");
}

/** What the browser needs before the page can be interactive. */
const page = await fetch(base + path, { headers: cookie ? { cookie } : {} });
const html = await page.text();

const assets = new Set();
for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) assets.add(m[1]);

let htmlBytes = zlib.gzipSync(Buffer.from(html), { level: 9 }).length;
let assetBytes = 0;
const rows = [];

for (const path of assets) {
  const res = await fetch(base + path);
  const body = Buffer.from(await res.arrayBuffer());
  // servers send these already compressed; fetch decodes, so re-measure
  const wire = zlib.gzipSync(body, { level: 9 }).length;
  assetBytes += wire;
  rows.push({ path: path.split("/").pop(), wire });
}

rows.sort((a, b) => b.wire - a.wire);

const total = htmlBytes + assetBytes;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

/*
  Transfer plus one round trip for the document and one for the assets, which
  are requested in parallel. Deliberately generous to the app: a real browser
  pays more, so a failure here is a certainty rather than a worry.
*/
const transferMs = total / bytesPerMs;
const estimate = RTT_MS * 2 + transferMs;

console.log(`\n${base}${path} — cold, on Slow 4G (${MBPS} Mbps, ${RTT_MS}ms RTT)\n`);
console.log(`  document        ${kb(htmlBytes)}`);
console.log(`  ${assets.size} assets      ${kb(assetBytes)}`);
console.log(`  total over wire ${kb(total)}\n`);
console.log(`  transfer        ${transferMs.toFixed(0)} ms`);
console.log(`  + 2 round trips ${RTT_MS * 2} ms`);
console.log(`  floor           ${estimate.toFixed(0)} ms   (budget ${BUDGET_MS} ms)\n`);
console.log(`  ${estimate <= BUDGET_MS ? "WITHIN" : "OVER"} the § 8.8 budget, before parse and hydration\n`);

console.log("largest over the wire:");
for (const r of rows.slice(0, 6)) console.log(`  ${kb(r.wire).padStart(9)}  ${r.path}`);
console.log("");

await cleanup();
