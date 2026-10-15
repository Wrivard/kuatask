/**
 * The identity a render is given, against a running server.
 *
 *   npm run build && npx next start -p 3100
 *   npm run verify:session                      # http://localhost:3100
 *
 * Server components stopped asking the auth server who you are. The middleware
 * verifies the session once, renews it if it needs renewing — it is the only
 * place on the server that can actually store the result — and hands the user
 * id and the access token inward on the request headers. The render queries
 * with a client built from that token, whose `auth` is a proxy that throws if
 * anything touches it.
 *
 * Why it had to change is in lib/request-auth.ts: a Server Component that
 * renews a token cannot write the rotated one back, so the browser was left
 * holding a refresh token the server had already spent, and an hour later the
 * renewal came back 400 and the session was destroyed. The edge logs for
 * 15 October 02:36:45 show eight renewals in 1.1 seconds, six of them from the
 * server.
 *
 * Two things are worth proving from outside, and neither can be read off the
 * source:
 *
 *   - the app still renders. Because the render's client throws on any use of
 *     `auth`, a page that comes back 200 is proof that nothing in it asked the
 *     auth server anything — the thing that used to rotate the token.
 *   - the headers are not a way in. They are internal, but a browser can send
 *     them, so the middleware deletes them on arrival and stamps its own.
 *
 * Same throwaway member as verify:headers — invited, created, signed in with a
 * password, deleted in a `finally`. Never an account a person uses.
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
const base = process.argv[2] ?? "http://localhost:3100";

const admin = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const stamp = Date.now();
const PW = `Session-${stamp}-aA1!`;
const email = `kua-session-${stamp}@example.com`;

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

const cleanup = async () => {
  if (invite?.id) await admin.from("pending_invites").delete().eq("id", invite.id);
  await admin.auth.admin.deleteUser(created.user.id);
};

const client = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
  email,
  password: PW,
});
if (signInError) {
  await cleanup();
  throw signInError;
}

const me = signedIn.user.id;
const value = "base64-" + Buffer.from(JSON.stringify(signedIn.session)).toString("base64");
const CHUNK = 3180;
const cookie = (value.length <= CHUNK
  ? [`sb-${ref}-auth-token=${value}`]
  : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) =>
      `sb-${ref}-auth-token.${i}=${value.slice(i * CHUNK, (i + 1) * CHUNK)}`)
).join("; ");

/** A uuid that is not anybody, and a token shaped like a real one. */
const FORGED_ID = "00000000-dead-4000-8000-000000000000";
const FORGED_TOKEN = signedIn.session.access_token;

let bad = 0;
const check = (name, ok, detail = "") => {
  if (!ok) bad += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const section = (n) => console.log(`\n${n}`);

const get = (path, headers) =>
  fetch(base + path, { headers, redirect: "manual" }).then(async (r) => ({
    status: r.status,
    location: r.headers.get("location"),
    headers: r.headers,
    body: await r.text(),
  }));

try {
  section("Le rendu reçoit l'identité sans parler au serveur d'auth");
  {
    const r = await get("/", { cookie });
    check("the app renders for a signed-in member", r.status === 200, String(r.status));
    /*
      The render's client has no auth: `supabase.auth.anything` throws by
      construction (supabase-js, the accessToken option). So a 200 here is not
      just "it works" — it is proof that no server component asked the auth
      server who this is, which is what used to rotate the refresh token.
    */
    check("and the page is the app rather than an error", r.body.includes(me), `${me} in body`);
  }

  {
    const r = await get("/notes", { cookie });
    check("a page that reads its own data renders too", r.status === 200, String(r.status));
  }

  section("Les en-têtes internes ne sont pas une porte d'entrée");
  {
    const r = await get("/", {
      "x-kua-user": FORGED_ID,
      "x-kua-token": FORGED_TOKEN,
    });
    check("sent without a session, they get you nowhere",
          r.status === 307 && (r.location ?? "").includes("/login"),
          `${r.status} ${r.location ?? ""}`);
  }

  {
    const r = await get("/", { cookie, "x-kua-user": FORGED_ID, "x-kua-token": FORGED_TOKEN });
    check("sent with a session, the middleware overwrites them",
          r.status === 200 && r.body.includes(me) && !r.body.includes(FORGED_ID),
          `${r.status} forged=${r.body.includes(FORGED_ID)}`);
  }

  {
    const r = await get("/", { cookie });
    const leaked = [...r.headers.keys()].filter((k) => k.startsWith("x-kua"));
    check("and they never come back out to the browser", leaked.length === 0, leaked.join(","));
  }

  section("Et ce qui n'a pas de session reste dehors");
  {
    const r = await get("/", {});
    check("no cookie, no app", r.status === 307 && (r.location ?? "").includes("/login"),
          `${r.status} ${r.location ?? ""}`);
  }
} finally {
  await cleanup();
}

console.log(`\n${bad === 0 ? "the request carries what it should and nothing else" : `${bad} FAILED`}`);
process.exit(bad ? 1 : 0);
