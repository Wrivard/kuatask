/**
 * Prints a session cookie for a throwaway member, so a browser can be driven
 * against a running dev server.
 *
 *   node scripts/dev-login.mjs             # create, print the cookie
 *   node scripts/dev-login.mjs --cleanup   # delete every account it ever made
 *
 * `docs/12-definition-of-done.md` ends with "verify by using the app, not by
 * reading the code", and the app is behind a magic link — which is exactly the
 * thing a script must not mint. Supabase invalidates an address's previous link
 * when it issues a new one, so generating one for the owner breaks the login
 * email sitting in their inbox, silently, on both ends. `verify-headers.mjs`
 * carries the same warning for the same reason.
 *
 * So: a throwaway account with a password, invited into the workspace the same
 * way a real person would be, whose session is serialised into the cookie shape
 * `@supabase/ssr` reads. It is a real member of a real workspace while it exists.
 * It can see and change real tasks. Delete it when you are done.
 *
 * NEVER point this at production. It writes a member row into whatever project
 * the env file names.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const envPath = ".env.local";
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SR) {
  console.error(`missing Supabase keys in ${envPath}`);
  process.exit(2);
}

const ref = new URL(URL_).host.split(".")[0];
const admin = createClient(URL_, SR, { auth: { persistSession: false } });

/** The prefix every account this script creates shares, so cleanup can find them. */
const PREFIX = "kua-dev-";

if (process.argv.includes("--cleanup")) {
  const { data: users } = await admin.auth.admin.listUsers();
  const mine = users.users.filter((u) => u.email?.startsWith(PREFIX));
  for (const u of mine) await admin.auth.admin.deleteUser(u.id);
  await admin.from("pending_invites").delete().ilike("email", `${PREFIX}%`);

  // verified, not assumed — the same lesson the other scripts carry
  const { data: after } = await admin.auth.admin.listUsers();
  const left = after.users.filter((u) => u.email?.startsWith(PREFIX));
  console.log(
    left.length === 0
      ? `removed ${mine.length} dev account${mine.length === 1 ? "" : "s"}`
      : `FAILED — still there: ${left.map((u) => u.email).join(", ")}`,
  );
  process.exit(left.length === 0 ? 0 : 1);
}

const stamp = Date.now();
const email = `${PREFIX}${stamp}@example.com`;
const password = `Dev-${stamp}-aA1!`;

const { data: ws } = await admin.from("workspaces").select("id, name").limit(1).maybeSingle();
if (!ws) {
  console.error("no workspace to join");
  process.exit(2);
}

await admin.from("pending_invites").insert({ workspace_id: ws.id, email, role: "member" });

const { data: made, error: makeError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  // the signup trigger reads this for the profile it creates
  user_metadata: { display_name: "Dev" },
});
if (makeError) throw makeError;

const client = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({
  email,
  password,
});
if (signInError) throw signInError;

/*
  `@supabase/ssr` stores the whole session as one base64 value, split across
  numbered cookies past ~3.2 kB because a single cookie cannot hold it. The
  chunked names are `.0`, `.1`, … and the unchunked name has no suffix; getting
  this wrong reads as "signed out" with nothing to say why.
*/
const value = "base64-" + Buffer.from(JSON.stringify(signedIn.session)).toString("base64");
const CHUNK = 3180;
const cookies =
  value.length <= CHUNK
    ? [[`sb-${ref}-auth-token`, value]]
    : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [
        `sb-${ref}-auth-token.${i}`,
        value.slice(i * CHUNK, (i + 1) * CHUNK),
      ]);

console.log(`member  ${email}  in "${ws.name}"  (id ${made.user.id})`);
console.log(`\n# paste into the browser console on the dev origin:`);
console.log(
  cookies
    .map(([name, v]) => `document.cookie='${name}=${v};path=/;max-age=3600;SameSite=Lax';`)
    .join("\n"),
);
console.log(`\n# when finished:\nnode scripts/dev-login.mjs --cleanup`);
