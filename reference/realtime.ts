/**
 * Realtime subscription. See docs/05-architecture.md § Realtime.
 *
 * Reconciliation with local precedence lives in the store's applyRemote — this
 * file only wires the channel. Mount once, in the app shell, after hydration.
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useStore, type Task } from '@/lib/store';

export function useRealtimeTasks() {
  const workspaceId = useStore((s) => s.workspaceId);
  const applyRemote = useStore((s) => s.applyRemote);

  useEffect(() => {
    if (!workspaceId) return;
    const supabase = createClient();

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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [workspaceId, applyRemote]);
}
