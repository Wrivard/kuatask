"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { bucketOf, computeStreak, type Bucket } from "@/lib/time";
import { accentColor } from "@/components/task/assignee-dot";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Fixed 220px, hairline divider, no shadow.
 *
 * Counts are derived from the same store array the list renders, so they move
 * optimistically with everything else. A count that lags the list it describes
 * is the kind of small wrongness that erodes trust in the whole app.
 */
const BUCKETS: { bucket: Bucket; label: string }[] = [
  { bucket: "today", label: copy.nav.today },
  { bucket: "tomorrow", label: copy.nav.tomorrow },
  { bucket: "week", label: copy.nav.week },
  { bucket: "month", label: copy.nav.month },
];

export function Sidebar({ workspaceName }: { workspaceName: string }) {
  const tasks = useStore((s) => s.tasks);
  const members = useStore((s) => s.members);
  const me = useStore((s) => s.me);
  const filter = useStore((s) => s.assigneeFilter);
  const setFilter = useStore((s) => s.setAssigneeFilter);

  const counts = React.useMemo(() => {
    const map = new Map<Bucket, number>();
    for (const task of tasks) {
      if (task.status === "done") continue;
      if (filter !== null && task.assignee_id !== filter) continue;
      const b = bucketOf(task.due_on);
      map.set(b, (map.get(b) ?? 0) + 1);
    }
    return map;
  }, [tasks, filter]);

  const partner = members.find((m) => m.id !== me?.id);

  /*
    Consecutive Montreal days with at least one completion. Present, never
    nagging: no notification, no warning that it is about to break, no fire
    emoji, no milestones. A streak that pressures you is one you resent.
  */
  const streak = React.useMemo(
    () =>
      computeStreak(
        tasks.map((t) => t.completed_at).filter((v): v is string => v !== null),
      ),
    [tasks],
  );

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border lg:flex">
      <div className="px-4 py-4">
        <span className="text-[13px] font-medium text-fg">{workspaceName}</span>
      </div>

      <nav className="flex flex-col gap-px px-2">
        {BUCKETS.map((b) => (
          <a
            key={b.bucket}
            href={`#section-${b.bucket}`}
            className="flex items-center justify-between rounded-sm px-2 py-1.5 text-[13px] text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            <span>{b.label}</span>
            {(counts.get(b.bucket) ?? 0) > 0 && (
              <span className="font-mono text-[12px] tabular-nums text-fg-faint">
                {counts.get(b.bucket)}
              </span>
            )}
          </a>
        ))}
      </nav>

      <div className="mx-4 my-3 border-t border-border" />

      {/* the assignee lens */}
      <div className="flex flex-col gap-px px-2">
        <FilterItem active={filter === null} onClick={() => setFilter(null)}>
          {copy.filter.all}
        </FilterItem>

        {me && (
          <FilterItem
            active={filter === me.id}
            onClick={() => setFilter(me.id)}
            color={accentColor(me.accent)}
          >
            {copy.filter.mine}
          </FilterItem>
        )}

        {partner && (
          <FilterItem
            active={filter === partner.id}
            onClick={() => setFilter(partner.id)}
            color={accentColor(partner.accent)}
          >
            {partner.display_name}
          </FilterItem>
        )}
      </div>

      <div className="mx-4 my-3 border-t border-border" />

      <Link
        href="/settings"
        className="mx-2 flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-fg-muted hover:bg-surface-hover hover:text-fg"
      >
        <Users className="size-[18px]" strokeWidth={1.5} />
        {copy.nav.settings}
      </Link>

      {streak > 0 && (
        <div className="mt-auto px-4 py-4">
          <span className="font-mono text-[12px] tabular-nums text-fg-faint">
            {copy.streak(streak)}
          </span>
        </div>
      )}
    </aside>
  );
}

function FilterItem({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px]",
        active ? "bg-surface-hover text-fg" : "text-fg-muted hover:text-fg",
      )}
    >
      {color ? (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : (
        <span className="size-1.5 shrink-0" />
      )}
      {children}
    </button>
  );
}
