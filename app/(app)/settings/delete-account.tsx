"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteOwnAccount } from "./actions";
import { useStore } from "@/lib/store";
import { copy } from "@/lib/copy";

/**
 * Deleting your own account, behind a door you have to open twice.
 *
 * There is no undo for this and no soft-delete window — the account is gone,
 * the profile and the membership go with it, and nothing in the app can bring
 * them back. So the confirmation is typing your own address rather than
 * clicking a second button: a second button is a reflex, and a reflex is what
 * this needs to interrupt.
 *
 * The tasks stay, which the copy says plainly. Somebody deciding whether to do
 * this needs to know what survives, and finding out afterwards is not an
 * acceptable way to learn it.
 */
export function DeleteAccount() {
  const me = useStore((s) => s.me);
  const router = useRouter();

  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const address = me?.email ?? "";
  const matches = typed.trim().toLowerCase() === address.toLowerCase() && address !== "";

  async function confirm() {
    setBusy(true);
    const result = await deleteOwnAccount();
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push("/login");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-fg-faint underline decoration-border underline-offset-4 hover:text-danger hover:decoration-danger"
      >
        {copy.settings.deleteAccount}
      </button>
    );
  }

  return (
    <div className="max-w-[420px] rounded-md border border-danger/40 p-4">
      <p className="text-[13px] font-medium text-fg">{copy.settings.deleteAccount}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">
        {copy.settings.deleteAccountBody}
      </p>

      <label className="mt-3 block text-[12px] text-fg-faint" htmlFor="confirm-address">
        {copy.settings.deleteAccountConfirm(address)}
      </label>
      <Input
        id="confirm-address"
        type="email"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="mt-1.5 h-8 rounded-md border-border bg-bg text-[13px] dark:bg-bg"
      />

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={!matches || busy}
          onClick={() => void confirm()}
          className="h-8 rounded-sm px-2 text-[13px] text-danger hover:text-danger"
        >
          {busy ? copy.settings.deleting : copy.settings.deleteAccountDo}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setTyped("");
          }}
          className="h-8 rounded-sm px-2 text-[13px] text-fg-muted"
        >
          {copy.settings.cancel}
        </Button>
      </div>
    </div>
  );
}
