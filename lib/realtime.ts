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
import { useStore, type Task } from '@/lib/store';

/** Below this, a tab was never really away and the socket held. */
const STALE_AFTER_MS = 15_000;

export function useRealtimeTasks() {
  const workspaceId = useStore((s) => s.workspaceId);
  const applyRemote = useStore((s) => s.applyRemote);

  /** Set once the channel has been up, so the first SUBSCRIBED is not a "re"connect. */
  const wasConnected = useRef(false);
  const hiddenSince = useRef<number | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();
    const resync = () => void useStore.getState().resync();

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
          const row = (payload.new ?? payload.old) as Task;
          applyRemote(payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE', row);
        },
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // a later SUBSCRIBED means the channel dropped and came back
        if (wasConnected.current) resync();
        wasConnected.current = true;
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
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', resync);
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, applyRemote]);
}
