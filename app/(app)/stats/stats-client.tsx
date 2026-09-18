"use client";

import * as React from "react";
import { Avatar } from "@/components/task/avatar";
import { Chip } from "@/components/ui/chip";
import { useLocalLens } from "@/lib/lens";
import { longestStreakFromDays, streakFromDays, type DayString } from "@/lib/time";
import { useToday } from "@/lib/day";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type PersonStats = {
  id: string;
  displayName: string;
  accent: string;
  avatarUrl: string | null;
  today: number;
  week: number;
  month: number;
  total: number;
  days: DayString[];
};

/** Which column the ordering follows. A leaderboard needs one to be about. */
const PERIODS = ["today", "week", "month", "total"] as const;
type Period = (typeof PERIODS)[number];

const COUNT: Record<Period, (p: PersonStats) => number> = {
  today: (p) => p.today,
  week: (p) => p.week,
  month: (p) => p.month,
  total: (p) => p.total,
};

/**
 * The comparison, as numbers.
 *
 * No medals, no ranks printed as "1st", no trophy beside the leader. `docs/08`
 * bans those on the list and the reasoning survives the trip here: two people
 * comparing micro-tasks is enjoyable exactly as long as it stays information,
 * and the moment it hands somebody a prize it starts deciding what kind of task
 * is worth doing. Whoever is ahead is ahead because their number is bigger,
 * which is legible without being told.
 *
 * The bar is proportional to the leader rather than to a target. There is no
 * right number of tasks to finish in a day, and drawing a bar against a goal
 * would invent one.
 */
export function StatsClient({ people, me }: { people: PersonStats[]; me: string }) {
  const day = useToday();
  const [period, setPeriod] = useLocalLens<Period>("kua-stats-period", "week", PERIODS);

  const ranked = React.useMemo(() => {
    const count = COUNT[period];
    return [...people].sort((a, b) => count(b) - count(a) || a.displayName.localeCompare(b.displayName));
  }, [people, period]);

  const leader = ranked.length > 0 ? COUNT[period](ranked[0]) : 0;

  return (
    <div className="max-w-[760px] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
            {copy.stats.period[p]}
          </Chip>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {ranked.map((person) => {
          const count = COUNT[period](person);
          const streak = streakFromDays(person.days, day);
          const best = longestStreakFromDays(person.days);

          return (
            <li
              key={person.id}
              className={cn(
                "rounded-md border border-border px-4 py-3",
                // your own row, marked the way the app marks "yours" everywhere
                person.id === me && "bg-surface",
              )}
            >
              <div className="flex items-center gap-3">
                <Avatar member={{ display_name: person.displayName, accent: person.accent, avatar_url: person.avatarUrl }} size="md" />

                <span className="min-w-0 flex-1 truncate text-[15px] text-fg">
                  {person.displayName}
                </span>

                <span className="shrink-0 font-mono text-[22px] tabular-nums text-fg">
                  {count}
                </span>
              </div>

              {/*
                Proportional to whoever is ahead, not to a goal. A bar against a
                target would be inventing a right number of tasks per day, which
                is the sort of thing that quietly starts shaping which tasks get
                written down.
              */}
              <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{
                    width: leader > 0 ? `${(count / leader) * 100}%` : "0%",
                    backgroundColor: `var(--color-accent)`,
                  }}
                />
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                <Stat label={copy.stats.streak} value={streak} />
                <Stat label={copy.stats.best} value={best} />
                <Stat label={copy.stats.allTime} value={person.total} />
              </dl>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-[12px] text-fg-faint">{copy.stats.footnote}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className={MICRO_LABEL}>{label}</dt>
      <dd className="font-mono text-[13px] tabular-nums text-fg-muted">{value}</dd>
    </div>
  );
}
