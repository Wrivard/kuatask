"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/task/avatar";
import {
  inviteMember,
  removeMember,
  resendInvite,
  revokeInvite,
  setRole,
} from "./actions";
import { formatDueLabel, instantToDay } from "@/lib/time";
import { copy } from "@/lib/copy";

type MemberRow = {
  userId: string;
  role: "admin" | "member";
  displayName: string;
  email: string;
  avatarUrl: string | null;
  accent: string;
};

type InviteRow = {
  id: string;
  email: string;
  role: "admin" | "member";
  /** So the page can say how long somebody has been waiting. */
  created_at: string;
};

export function PeopleClient({
  members,
  invites,
  meId,
  isAdmin,
}: {
  members: MemberRow[];
  invites: InviteRow[];
  meId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setBusy(true);
    const result = await fn();
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error ?? copy.error.saveFailed);
      return;
    }
    if (done) toast.success(done);
    router.refresh();
  }

  return (
    <div className="max-w-[760px] px-6 py-6">
      <section className="mb-8">
        <h2 className="mb-2 text-[13px] font-medium text-fg-muted">
          {copy.people.members}
        </h2>
        <ul>
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex min-h-11 items-center gap-3 border-b border-border py-1.5"
            >
              <Avatar
                member={{
                  display_name: m.displayName,
                  accent: m.accent,
                  avatar_url: m.avatarUrl,
                }}
                size="md"
              />
              {/*
                Two people can pick the same display name, and an invite is sent
                to an address rather than to a name — so a member list that shows
                only names cannot be checked against the invite that produced it.
              */}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px]">
                  {m.displayName}
                  {m.userId === meId && (
                    <span className="ml-1.5 text-[12px] text-fg-faint">
                      ({copy.people.you})
                    </span>
                  )}
                </span>
                {m.email && m.email !== m.displayName && (
                  <span className="truncate text-[12px] text-fg-faint">{m.email}</span>
                )}
              </span>
              <span className="shrink-0 text-[12px] text-fg-faint">
                {m.role === "admin" ? copy.people.roleAdmin : copy.people.roleMember}
              </span>

              {/*
                docs/03: an admin « can invite, remove, and change roles ». The
                third was never built — the policy allowed it and the trigger
                enforced the last-admin rule, but nothing could ask — so a role
                was something you were given once, by a seed, for ever.
              */}
              {isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => setRole(m.userId, m.role === "admin" ? "member" : "admin"),
                      copy.people.roleChanged,
                    )
                  }
                  className="h-7 shrink-0 rounded-sm px-2 text-[12px] text-fg-muted hover:text-fg"
                >
                  {m.role === "admin" ? copy.people.demote : copy.people.promote}
                </Button>
              )}
              {isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void run(() => removeMember(m.userId))}
                  className="h-7 rounded-sm px-2 text-[12px] text-fg-muted hover:text-danger"
                >
                  {copy.people.remove}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-[13px] font-medium text-fg-muted">
            {copy.people.pending}
          </h2>
          <ul>
            {invites.map((i) => (
              <li
                key={i.id}
                className="flex min-h-11 items-center gap-3 border-b border-border py-1.5"
              >
                {/*
                  When it was created, because a pending invite says nothing
                  about whether anybody was told. This workspace's own first one
                  was written by the seed in migration 0001 — the row had
                  existed since before there was a member, and no email was ever
                  sent for it. From the page it looked exactly like one that had.
                */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] text-fg-muted">{i.email}</span>
                  <span className="truncate text-[12px] text-fg-faint">
                    {copy.people.invitedOn(formatDueLabel(instantToDay(i.created_at)))}
                  </span>
                </span>
                {/*
                  What the invitation grants. It was fetched and never shown, so
                  an invite carrying admin looked exactly like one carrying
                  member — and this workspace's seeded invite grants admin,
                  which is a decision nobody in it made on purpose. Who can
                  remove whom is worth knowing before they arrive, not after.
                */}
                <span className="shrink-0 text-[12px] text-fg-faint">
                  {i.role === "admin" ? copy.people.roleAdmin : copy.people.roleMember}
                </span>

                {isAdmin && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => resendInvite(i.id), copy.people.resent)}
                      className="h-7 shrink-0 rounded-sm px-2 text-[12px] text-fg-muted hover:text-fg"
                    >
                      {copy.people.resend}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void run(() => revokeInvite(i.id))}
                      className="h-7 shrink-0 rounded-sm px-2 text-[12px] text-fg-muted hover:text-danger"
                    >
                      {copy.people.revoke}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <section>
          <h2 className="mb-2 text-[13px] font-medium text-fg-muted">
            {copy.people.invite}
          </h2>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const address = email.trim();
              if (!address) return;
              void run(async () => {
                const result = await inviteMember(address);
                if (result.ok) setEmail("");
                return result;
              }, copy.people.inviteSent(address));
            }}
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={copy.people.invitePlaceholder}
              className="h-9 max-w-[320px] rounded-sm text-[14px]"
            />
            <Button
              type="submit"
              disabled={busy || email.trim() === ""}
              className="h-9 rounded-sm text-[14px] font-medium"
            >
              {copy.people.inviteSend}
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
