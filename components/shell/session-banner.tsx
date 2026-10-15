"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSessionState } from "@/lib/session";
import { copy } from "@/lib/copy";

/**
 * The session is gone, and your work is not.
 *
 * There was nothing here before, which is the whole of the problem reported as
 * « the database rolled back ». When the token refresh was refused the app
 * carried on as though nothing had happened: every tick, every invoice line,
 * every note was rejected and quietly reverted, and the first honest word came
 * from the login screen after a reload, with the afternoon missing.
 *
 * A row above the app rather than a toast. A toast is for something that has
 * finished happening; this is a condition, it lasts until you sign in again,
 * and it has to still be there when you look up. It says how many changes are
 * waiting, because « reconnecte-toi » on its own invites the reasonable fear
 * that the work is already lost — and it is not: lib/outbox.ts is holding it,
 * in storage that survives the reload the magic link causes.
 */
export function SessionBanner() {
  const [lost, waiting] = useSessionState();
  const router = useRouter();

  if (!lost) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-danger/15 px-4 py-2 text-center text-[13px] text-fg"
    >
      <span className="size-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
      <span>{copy.auth.expired}</span>
      {waiting > 0 && <span className="text-fg-muted">{copy.auth.waiting(waiting)}</span>}
      <button
        type="button"
        onClick={() => router.push("/login")}
        className="rounded-sm font-medium text-accent underline underline-offset-4 hover:text-fg"
      >
        {copy.auth.signInAgain}
      </button>
    </div>
  );
}
