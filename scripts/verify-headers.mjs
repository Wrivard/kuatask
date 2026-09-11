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

/*
  A throwaway member, not a real one.

  This used to mint a magic link for the first member it found — which is an
  owner's actual address. Supabase invalidates any earlier link for an address
  when a new one is issued, so running this while somebody was signing in broke
  their link, with nothing on either end to explain why. A verification script
  is not allowed to interfere with the thing it is verifying.

  Same shape as the other live suites: invite, create, sign in with a password,
  delete afterwards, and never touch an account a person uses.
*/
const stamp = Date.now();
const PW = `Headers-${stamp}-aA1!`;
const email = `kua-headers-${stamp}@example.com`;

const { data: ws } = await admin.from("workspaces").select("id").limit(1).maybeSingle();
if (!ws) {
  console.error("no workspace to join — run npm run verify:db first, or seed one");
  process.exit(2);
}

const { data: invite } = await admin
  .from("pending_invites")
  .insert({ workspace_id: ws.id, email, role: "member" })
  .select("id")
  .single();

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password: PW,
  email_confirm: true,
});
if (createError) throw createError;

/*
  Cleanup is awaited in a `finally`, not fired from a `process.on("exit")` hook.

  The first version did the latter and it did not work: the exit event is
  synchronous, so the delete was dispatched and the process was gone before it
  landed. The throwaway member survived every run — caught by checking
  afterwards rather than by trusting the code, which is the same lesson
  verify-db carries at the top of its own cleanup.
*/
const cleanup = async () => {
  if (invite?.id) await admin.from("pending_invites").delete().eq("id", invite.id);
  await admin.auth.admin.deleteUser(created.user.id);
};

const client = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
  email,
  password: PW,
});
if (signInError) throw signInError;

const session = signedIn.session;
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

try {
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
    /*
      The pair that has to move together. An avatar is a URL somebody pastes, so
      img-src has to reach the whole web; script-src must not, and the two live
      four lines apart in the same object where widening one while meaning the
      other is a plausible slip.

      This check exists because the opposite already happened: the avatar field
      shipped while img-src still said 'self', so every external image was
      refused and the component's onError fallback hid it perfectly. Nothing
      failed, nothing logged, and the feature simply did not work.
    */
    check("img-src allows a pasted avatar", /img-src[^;]*https:/.test(csp));
    check("...without script-src following it", !/script-src[^;]*https:(?!\/)/.test(csp));

    // the static ones from next.config.ts, which travel on the same responses
    check("nosniff", r.headers.get("x-content-type-options") === "nosniff");
    check("framing denied", r.headers.get("x-frame-options") === "DENY");
    check("referrer policy", r.headers.get("referrer-policy") === "strict-origin-when-cross-origin");
    check("permissions policy", (r.headers.get("permissions-policy") ?? "").includes("camera=()"));
  }

    console.log(`\n${bad === 0 ? "the policy holds" : `${bad} FAILED`}`);
} finally {
  await cleanup();

  // verified, not assumed — the reason this file was wrong the first time
  const { data: users } = await admin.auth.admin.listUsers();
  const stray = users.users.filter((u) => u.email?.startsWith("kua-headers-"));
  check("no throwaway member left behind", stray.length === 0,
        stray.map((u) => u.email).join(", "));
}

process.exit(bad ? 1 : 0);
