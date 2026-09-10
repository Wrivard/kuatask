"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { accentColor } from "@/components/task/assignee-dot";
import { VIEWS } from "./view-switch";
import { useStore } from "@/lib/store";
import { bucketOf, instantToDay, streakFromDays, type Bucket } from "@/lib/time";
import { useToday } from "@/lib/day";
import { prefersReducedMotion } from "@/lib/motion";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

const BUCKETS: { bucket: Bucket; label: string }[] = [
  { bucket: "today", label: copy.nav.today },
  { bucket: "tomorrow", label: copy.nav.tomorrow },
  { bucket: "week", label: copy.nav.week },
  { bucket: "month", label: copy.nav.month },
];

/**
 * The left rail, in the order the app is used: where you are, then what is
 * coming, then whose it is.
 *
 * The three views sit at the top because that is where navigation belongs and
 * where people look for it. They used to live in the header while the rail
 * opened with the due-date list, which reads exactly like primary navigation
 * and is not — so the rail's most prominent block did the least, and the actual
 * navigation was somewhere else entirely.
 */
export function Sidebar({ workspaceName }: { workspaceName: string }) {
  const tasks = useStore((s) => s.tasks);
  const members = useStore((s) => s.members);
  const me = useStore((s) => s.me);
  const filter = useStore((s) => s.assigneeFilter);
  const setFilter = useStore((s) => s.setAssigneeFilter);

  const pathname = usePathname();
  const router = useRouter();
  const onList = pathname === "/";

  const day = useToday();

  const counts = React.useMemo(() => {
    const map = new Map<Bucket, number>();
    for (const task of tasks) {
      if (task.status === "done") continue;
      if (filter !== null && task.assignee_id !== filter) continue;
      const b = bucketOf(task.due_on, day);
      map.set(b, (map.get(b) ?? 0) + 1);
    }
    return map;
  }, [tasks, filter, day]);

  const partner = members.find((m) => m.id !== me?.id);
  const current = useVisibleSection(onList);

  /*
    These were anchors to `#section-today`, which did nothing at all on the
    board or the calendar — those pages have no such element — and did nothing
    on the list either when the section was empty, because an empty section does
    not render. Both cases looked like a broken link.

    Now they are buttons. From another view they navigate to the list with the
    hash, and an empty one is drawn as empty rather than staying clickable and
    inert.
  */
  function jump(bucket: Bucket) {
    if (!onList) {
      router.push(`/#section-${bucket}`);
      return;
    }
    document.getElementById(`section-${bucket}`)?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }

  /*
    Consecutive Montreal days with at least one completion. Present, never
    nagging: no notification, no warning that it is about to break, no fire
    emoji, no milestones. A streak that pressures you is one you resent.
  */
  const streak = useStreak(day);

  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-border lg:flex">
      <div className="px-4 py-4">
        <span className="text-[13px] font-medium text-fg">{workspaceName}</span>
      </div>

      <nav className="flex flex-col gap-px px-2" aria-label={copy.nav.list}>
        {VIEWS.map(({ href, icon: Icon, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                active
                  ? "bg-surface-hover font-medium text-fg"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.5} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-4 my-3 border-t border-border" />

      <div className="flex flex-col gap-px px-2">
        {BUCKETS.map((b) => {
          const count = counts.get(b.bucket) ?? 0;
          const empty = count === 0;
          return (
            <button
              key={b.bucket}
              type="button"
              onClick={() => jump(b.bucket)}
              disabled={empty}
              aria-current={onList && current === b.bucket ? "true" : undefined}
              className={cn(
                "flex items-center justify-between rounded-sm px-2 py-1.5 text-left text-[13px]",
                empty
                  ? "cursor-default text-fg-faint"
                  : "text-fg-muted hover:bg-surface-hover hover:text-fg",
                onList && current === b.bucket && !empty && "bg-surface-hover text-fg",
              )}
            >
              <span>{b.label}</span>
              <span
                className={cn(
                  "font-mono text-[12px] tabular-nums",
                  empty ? "text-fg-faint/60" : "text-fg-faint",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

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
        className={cn(
          "mx-2 flex items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
          pathname.startsWith("/settings")
            ? "bg-surface-hover font-medium text-fg"
            : "text-fg-muted hover:bg-surface-hover hover:text-fg",
        )}
      >
        <Users className="size-4 shrink-0" strokeWidth={1.5} />
        {copy.nav.settings}
      </Link>

      {streak > 0 && (
        <div className="mt-auto px-4 py-4">
          <span
            className="font-mono text-[12px] tabular-nums text-fg-faint"
            title={copy.a11y.streak(streak)}
          >
            <span className="sr-only">{copy.a11y.streak(streak)}</span>
            <span aria-hidden>{copy.streak(streak)}</span>
          </span>
        </div>
      )}
    </aside>
  );
}

/**
 * Which section is at the top of the viewport, so the rail says where you are.
 *
 * A list of six sections behind one scrollbar gives no sense of position, and
 * the rail was the obvious place to put that and did not. IntersectionObserver
 * rather than a scroll handler: the browser does the work off the main thread.
 */
function useVisibleSection(enabled: boolean): Bucket | null {
  const [current, setCurrent] = React.useState<Bucket | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setCurrent(null);
      return;
    }

    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) seen.add(entry.target.id);
          else seen.delete(entry.target.id);
        }
        // the topmost visible one wins, in document order
        const first = [...document.querySelectorAll('[id^="section-"]')].find((el) =>
          seen.has(el.id),
        );
        setCurrent(
          first ? (first.id.replace("section-", "") as Bucket) : null,
        );
      },
      // a band across the top of the viewport: what you are actually reading
      { rootMargin: "-10% 0px -75% 0px" },
    );

    for (const el of document.querySelectorAll('[id^="section-"]')) {
      observer.observe(el);
    }
    return () => observer.disconnect();
    // re-observed when the route changes; sections appearing later are covered
    // by the band being generous
  }, [enabled]);

  return current;
}

/**
 * The streak, over the server's day history plus anything completed in this
 * session. Local completions matter because ticking the last task should move
 * the number immediately, not after a reload.
 */
function useStreak(day: string): number {
  const completionDays = useStore((s) => s.completionDays);
  const tasks = useStore((s) => s.tasks);

  return React.useMemo(() => {
    const local = tasks
      .map((t) => t.completed_at)
      .filter((v): v is string => v !== null)
      .map(instantToDay);
    return streakFromDays([...completionDays, ...local], day);
  }, [completionDays, tasks, day]);
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
