"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accentColor } from "@/components/task/assignee-dot";
import { inviteMember, removeMember, revokeInvite } from "./actions";
import { copy } from "@/lib/copy";

type MemberRow = {
  userId: string;
  role: "admin" | "member";
  displayName: string;
  email: string;
  accent: string;
};

type InviteRow = { id: string; email: string; role: "admin" | "member" };

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
              className="flex h-11 items-center gap-3 border-b border-border"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accentColor(m.accent) }}
              />
              <span className="min-w-0 flex-1 truncate text-[15px]">
                {m.displayName}
                {m.userId === meId && (
                  <span className="ml-1.5 text-[12px] text-fg-faint">
                    ({copy.people.you})
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[12px] text-fg-faint">
                {m.role === "admin" ? copy.people.roleAdmin : copy.people.roleMember}
              </span>
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
                className="flex h-11 items-center gap-3 border-b border-border"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] text-fg-muted">
                  {i.email}
                </span>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void run(() => revokeInvite(i.id))}
                    className="h-7 rounded-sm px-2 text-[12px] text-fg-muted hover:text-danger"
                  >
                    {copy.people.revoke}
                  </Button>
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
