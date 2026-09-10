/**
 * The security headers, against a running server.
 *
 *   npm run build && npm run start
 *   npm run verify:headers                       # http://localhost:3000
 *   npm run verify:headers https://kuatask.vercel.app
 *
 * A Content-Security-Policy is the one security control that fails silently in
 * exactly the wrong direction: get it slightly wrong and the app stops working,
 * get it slightly loose and nothing tells you. The interesting assertion is
 * that every script tag the app ships carries the nonce the policy names — 31
 * of them on the list view, all injected by Next rather than written here, so
 * the only way to know is to ask a real response.
 *
 * Not part of `npm run verify`: it needs a server, and CI builds without
 * environment variables on purpose. Run it before a deploy that touched the
 * middleware, the layout, or lib/csp.ts.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ref = new URL(URL_).hostname.split(".")[0];
const base = process.argv[2] ?? "http://localhost:3000";

const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: members } = await admin.from("workspace_members").select("user_id").limit(1);
const { data: u } = await admin.auth.admin.getUserById(members[0].user_id);
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });

const res = await fetch(
  `${URL_}/auth/v1/verify?token=${link.properties.hashed_token}&type=magiclink&redirect_to=${base}`,
  { headers: { apikey: ANON }, redirect: "manual" },
);
const frag = new URLSearchParams((res.headers.get("location") ?? "").split("#")[1] ?? "");
const access = frag.get("access_token");
if (!access) throw new Error("no token");

const session = {
  access_token: access,
  refresh_token: frag.get("refresh_token"),
  expires_in: Number(frag.get("expires_in")),
  expires_at: Math.floor(Date.now() / 1000) + Number(frag.get("expires_in")),
  token_type: "bearer",
  user: u.user,
};
const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64");
const CHUNK = 3180;
const cookie = (value.length <= CHUNK
  ? [`sb-${ref}-auth-token=${value}`]
  : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) =>
      `sb-${ref}-auth-token.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`)
).join("; ");

let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

for (const path of ["/", "/board", "/calendar", "/login"]) {
  const r = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
  const csp = r.headers.get("content-security-policy");
  if (!csp) {
    check(`${path} carries a policy`, false);
    continue;
  }

  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  const html = r.status === 200 ? await r.text() : "";

  // every <script> that is not a JSON payload must carry the nonce
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
  const executable = scripts.filter((a) => !/type="application\/json"/.test(a));
  const unnonced = executable.filter((a) => !a.includes(`nonce="${nonce}"`));

  console.log(`\n${path}  ${r.status}  ${executable.length} script tags`);
  check("a policy is sent", Boolean(csp));
  check("it names a nonce", Boolean(nonce));
  check("every executable script carries it", unnonced.length === 0,
        unnonced.slice(0, 2).join(" | "));
  check("no unsafe-inline in script-src",
        !/script-src[^;]*'unsafe-inline'/.test(csp));
  check("no unsafe-eval in a production build",
        !/script-src[^;]*'unsafe-eval'/.test(csp));
  check("connect-src reaches Supabase over https and wss",
        csp.includes(new URL(URL_).origin) && csp.includes(`wss://${new URL(URL_).host}`));
  check("frame-ancestors is none", /frame-ancestors 'none'/.test(csp));
  check("object-src is none", /object-src 'none'/.test(csp));

  // the static ones from next.config.ts, which travel on the same responses
  check("nosniff", r.headers.get("x-content-type-options") === "nosniff");
  check("framing denied", r.headers.get("x-frame-options") === "DENY");
  check("referrer policy", r.headers.get("referrer-policy") === "strict-origin-when-cross-origin");
  check("permissions policy", (r.headers.get("permissions-policy") ?? "").includes("camera=()"));
}

console.log(`\n${bad === 0 ? "the policy holds" : `${bad} FAILED`}`);
process.exit(bad ? 1 : 0);
