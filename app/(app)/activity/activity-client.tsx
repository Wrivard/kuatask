"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Check, RotateCcw, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { accentColor } from "@/components/task/assignee-dot";
import { restoreTask } from "./actions";
import { formatDueLabel, instantToDay, isOnDay, today as todayNow } from "@/lib/time";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type ActivityAction =
  | "created"
  | "updated"
  | "completed"
  | "reopened"
  | "deleted";

type Action = ActivityAction;

type Entry = {
  id: string;
  task_id: string;
  actor_id: string | null;
  action: Action;
  title: string;
  changed: string[] | null;
  created_at: string;
  restorable: boolean;
};

type Person = { id: string; display_name: string; accent: string };

const ICON: Record<Action, LucideIcon> = {
  created: Plus,
  updated: Pencil,
  completed: Check,
  reopened: RotateCcw,
  deleted: Trash2,
};

/**
 * The log, newest first, grouped by day.
 *
 * Grouped because "what happened yesterday" is the question people bring here,
 * and an unbroken list of timestamps makes you do the grouping in your head.
 * Deletions are the only entries that carry an action, since they are the only
 * ones with anything to undo — everything else can be edited on the task itself.
 */
export function ActivityClient({
  entries,
  people,
}: {
  entries: Entry[];
  people: Person[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const today = todayNow();

  const byDay = React.useMemo(() => {
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
      const day = instantToDay(entry.created_at);
      const list = groups.get(day) ?? [];
      list.push(entry);
      groups.set(day, list);
    }
    return [...groups.entries()];
  }, [entries]);

  async function restore(entry: Entry) {
    setBusy(entry.id);
    const result = await restoreTask(entry.id);
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(copy.activity.restored);
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="max-w-[760px] px-6 py-6">
        <p className="text-[13px] text-fg-muted">{copy.activity.empty}</p>
      </div>
    );
  }

  return (
    <div className="max-w-[760px] px-6 py-6">
      {byDay.map(([day, group]) => (
        <section key={day} className="mb-6">
          <h2 className="mb-1 text-[13px] font-medium text-fg-muted">
            {isOnDay(group[0].created_at, today)
              ? copy.nav.today
              : formatDueLabel(day)}
          </h2>

          <ul>
            {group.map((entry) => {
              const who = people.find((p) => p.id === entry.actor_id);
              const Icon = ICON[entry.action];

              return (
                <li
                  key={entry.id}
                  className="flex min-h-11 items-center gap-3 border-b border-border py-2"
                >
                  <Icon
                    className={cn(
                      "size-3.5 shrink-0",
                      entry.action === "completed" ? "text-accent" : "text-fg-faint",
                      entry.action === "deleted" && "text-danger",
                    )}
                    strokeWidth={1.5}
                    aria-hidden
                  />

                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "truncate text-[15px]",
                        entry.action === "deleted" ? "text-fg-muted line-through" : "text-fg",
                      )}
                    >
                      {entry.title}
                    </span>
                    <span className="truncate text-[12px] text-fg-faint">
                      {copy.activity.verb[entry.action]}
                      {who && ` · ${who.display_name}`}
                      {entry.action === "updated" &&
                        entry.changed?.length &&
                        ` · ${entry.changed
                          .map((f) => copy.activity.field[f] ?? f)
                          .join(", ")}`}
                    </span>
                  </span>

                  {who && (
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: accentColor(who.accent) }}
                      title={who.display_name}
                    />
                  )}

                  <span className="shrink-0 font-mono text-[12px] tabular-nums text-fg-faint">
                    {new Date(entry.created_at).toLocaleTimeString("fr-CA", {
                      timeZone: "America/Montreal",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>

                  {entry.restorable && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void restore(entry)}
                      className="h-7 shrink-0 rounded-sm px-2 text-[12px] text-fg-muted hover:text-fg"
                    >
                      {busy === entry.id ? copy.activity.restoring : copy.activity.restore}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <p className="text-[12px] text-fg-faint">{copy.activity.limit}</p>
    </div>
  );
}
