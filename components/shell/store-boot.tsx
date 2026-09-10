"use client";

import * as React from "react";
import { toast } from "sonner";
import { setErrorHandler, useStore, type Profile, type Task } from "@/lib/store";
import { useRealtimeTasks } from "@/lib/realtime";
import { setClockOffset } from "@/lib/time";
import { copy } from "@/lib/copy";

/**
 * Installs the data the server already fetched, connects the store's error
 * channel to sonner, and opens the realtime subscription.
 *
 * The seed happens in an effect, deliberately, even though seeding during render
 * would paint sooner. The store is a module singleton — the architecture doc
 * requires it to be readable outside React — and Next evaluates client component
 * modules on the server too, where that singleton is shared across every request
 * the process handles. Seeding during render would write one member's tasks into
 * state that the next request renders from, which is a cross-user leak, and the
 * `ready` guard would make it stick. An effect runs only in the browser, so the
 * singleton on the server stays empty and each session fills its own copy.
 *
 * The win is still the one that matters on a phone: the client no longer makes
 * three round trips of its own — session, membership, then tasks — because the
 * shell already had to ask Supabase who this is.
 */
export function StoreBoot({
  initial,
}: {
  initial: {
    tasks: Task[];
    members: Profile[];
    me: Profile | null;
    workspaceId: string;
    /** Montreal days that already had a completion — the streak's history. */
    completionDays: string[];
    /** The server's instant at render, so a wrong device clock cannot decide a day. */
    serverNow: string;
  };
}) {
  /*
    During render, not in an effect. StoreBoot sits above the views in the tree,
    so this runs before anything asks what day it is — and an offset applied
    after the first commit would not re-bucket what that commit already drew.

    Writing a module variable during render is safe here in a way store state is
    not: on the server the offset is always about zero, so there is nothing for
    one request to leak into the next.
  */
  setClockOffset(initial.serverNow);

  React.useEffect(() => {
    setErrorHandler((reason) =>
      toast.error(copy.error.saveFailed, { description: reason }),
    );
    useStore.getState().seed(initial);
    // seeded once per session; a later navigation must not reset live state
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useRealtimeTasks();

  return null;
}
