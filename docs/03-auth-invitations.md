# 03 — Auth and invitations

## Magic link, no passwords

For two people, passwords mean building a reset flow, a change flow, and strength validation — all to protect an account that already receives its own reset emails. Magic link (email OTP) removes the whole surface.

Sessions are cookie-based via `@supabase/ssr` and refreshed in middleware, so a returning user lands in the app without seeing the login screen. The link only appears at real session expiry.

## Client setup

Three files, standard `@supabase/ssr` pattern:

```
lib/supabase/client.ts     createBrowserClient — used in client components
lib/supabase/server.ts     createServerClient  — cookies() from next/headers
lib/supabase/middleware.ts session refresh, called from middleware.ts
```

`middleware.ts` at the root refreshes the session and gates routes:

- No session → redirect to `/login`, except `/login` and `/auth/callback`
- Session but zero workspace memberships → redirect to `/no-access`
- Otherwise → through

The membership check in middleware is a UX convenience. The security boundary is RLS. Do not treat the middleware as the guard.

## Login screen

Deliberately plain. Centred, one email input, one button, no logo lockup, no marketing copy, no illustration. It is seen roughly once a month.

States:
1. **Idle** — email field, `Envoyer le lien`
2. **Sent** — the field is replaced by a line naming the address, plus a resend affordance that is disabled for 30 seconds
3. **Error** — inline, specific, never "oops"

`/auth/callback` exchanges the code for a session and redirects to `/`.

## The no-access screen

A signed-in user with no memberships. One line of copy telling them to ask an admin for an invite, and a sign-out button. No nav, no shell, nothing else on the page. This is also what an uninvited stranger sees.

## Invitations

Admin-only, at `/settings/people`. The page lists current members with role and a remove action, then pending invites with a revoke action, then the invite form.

The server action:

```ts
'use server';
// 1. Verify the caller is an admin of the workspace. Do not trust the client.
// 2. Reject if the email already belongs to a member, or an invite is pending.
// 3. Insert into pending_invites.
// 4. supabaseAdmin.auth.admin.inviteUserByEmail(email, {
//      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
//    })
// 5. On step 4 failure, delete the row from step 3 and return the error.
```

Step 5 matters. Without it a failed send leaves a pending invite that nobody was told about, and the admin has no way to see the send failed.

Supabase mints the token and sends the email. There is no email pipeline to build, no Resend account, no template engine.

### Email template

Customize the **Invite user** template in the Supabase dashboard, in French:

```
Subject: Tu es invité sur Küa Tasks

Salut,

{{ .SiteURL }} — tu as été invité à rejoindre l'espace de tâches de Küa.

Clique ici pour activer ton compte : {{ .ConfirmationURL }}

Le lien expire dans 24 heures.
```

Test it against a real address before calling the invite flow done. A broken template fails silently in a way that looks like a working app.

## Removing people

An admin can remove a member. Two rules:

- An admin cannot remove themselves if they are the last admin. The server action rejects it with a clear message.
- Removing a member does not delete their tasks. `assignee_id` is `on delete set null` at the profile level, but membership removal touches only `workspace_members`, so their assigned tasks stay and simply show no assignee.

The second point is a decision, not an accident. Deleting someone's tasks when they leave loses work.

## Roles

`admin` can invite, remove, and change roles. `member` cannot. Otherwise identical — a member has full read and write on tasks.

Both founders are seeded as `admin`. The role distinction only becomes real when a third person is added.
