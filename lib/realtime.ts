/**
 * Realtime subscription. See docs/05-architecture.md § Realtime.
 *
 * Reconciliation with local precedence lives in the store's applyRemote — this
 * file only wires the channel and decides when the local copy can no longer be
 * trusted.
 *
 * postgres_changes has no replay. Anything that happens while the socket is down
 * never arrives, so a reconnect is not "back to normal", it is "you missed an
 * unknown amount". Every path back from an interruption therefore ends in a
 * resync rather than just a resubscribe.
 */

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStore, type Profile, type Subtask, type Task } from '@/lib/store';

/** Below this, a tab was never really away and the socket held. */
const STALE_AFTER_MS = 15_000;

/**
 * How often to refetch while the channel is down.
 *
 * Every path back from an interruption ends in a resync — but all of them
 * assume the interruption ends. A channel can also fail and stay failed: an
 * expired token it cannot refresh, a network that answers HTTP but not
 * websockets, a proxy that quietly drops the upgrade. `subscribe` reports those
 * as CHANNEL_ERROR or TIMED_OUT and supabase-js retries on its own, but if the
 * retries never succeed there is no later SUBSCRIBED to hang a resync on.
 *
 * What that looks like to somebody using the app is the worst version of this
 * failure: the board keeps working, keeps accepting writes, and silently stops
 * showing the other person's. This is the floor under that — while the socket
 * is down the app falls back to asking, so it converges within a minute instead
 * of never. It stops the moment the channel comes back.
 */
const DEGRADED_POLL_MS = 60_000;

export function useRealtimeTasks() {
  const workspaceId = useStore((s) => s.workspaceId);
  const applyRemote = useStore((s) => s.applyRemote);
  const applyRemoteProfile = useStore((s) => s.applyRemoteProfile);
  const applyRemoteSubtask = useStore((s) => s.applyRemoteSubtask);

  /** Set once the channel has been up, so the first SUBSCRIBED is not a "re"connect. */
  const wasConnected = useRef(false);
  const hiddenSince = useRef<number | null>(null);
  const degraded = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();
    const resync = () => void useStore.getState().resync();

    const stopPolling = () => {
      if (degraded.current === null) return;
      clearInterval(degraded.current);
      degraded.current = null;
    };

    const startPolling = () => {
      if (degraded.current !== null) return; // already falling back
      degraded.current = setInterval(() => {
        // a hidden tab is nobody's live view; visibility already resyncs on return
        if (document.visibilityState === 'hidden') return;
        resync();
      }, DEGRADED_POLL_MS);
    };

    const channel = supabase
      .channel(`tasks:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          /*
            By event, not `new ?? old`. supabase-js hands a DELETE an empty
            object as `new` — `{}`, which is not nullish — so the fallback never
            reached `old`, the row arrived with no id, and the filter that
            removes it matched nothing. The other person's deletes stayed on
            screen until the next resync.
          */
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Task;
          applyRemote(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', row);
        },
      )
      /*
        Identity is the only shared state that is not a task, and it was the one
        thing a live session never heard about: renaming yourself or changing
        your colour reached the other person's open tab only on a resync. No
        workspace filter, because `profiles` has no workspace column — RLS
        already scopes what a member can see, so the rows that arrive are the
        rows they were entitled to read anyway.
      */
      /*
        Checklist rows. No workspace filter, because `subtasks` has no workspace
        column — it belongs to its task, and RLS already decides which ones this
        person may read, so what arrives is what they were entitled to anyway.
      */
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subtasks' },
        (payload) => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Subtask;
          applyRemoteSubtask(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', row);
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          applyRemoteProfile(payload.new as Profile);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          stopPolling();
          // a later SUBSCRIBED means the channel dropped and came back
          if (wasConnected.current) resync();
          wasConnected.current = true;
          return;
        }

        /*
          CHANNEL_ERROR, TIMED_OUT, CLOSED. supabase-js is already retrying;
          this only covers the case where the retries do not work, so it must
          not fire while the channel is merely between attempts. The interval is
          long enough that a normal reconnect wins the race and cancels it.
        */
        startPolling();
      });

    /*
      A sleeping laptop does not always tear the socket down in a way the client
      notices, so visibility is checked independently of the channel. The
      threshold keeps an alt-tab from refetching.
    */
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince.current = Date.now();
        return;
      }
      const away = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
      hiddenSince.current = null;
      if (away > STALE_AFTER_MS) resync();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', resync);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', resync);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, applyRemote, applyRemoteProfile, applyRemoteSubtask]);
}
