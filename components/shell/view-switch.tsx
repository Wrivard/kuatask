"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, Columns3, CalendarDays, History, type LucideIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Liste · Tableau · Calendrier.
 *
 * Three projections of one dataset, so switching is a lens change rather than
 * navigation with a cost: every view is a useMemo over the same local array and
 * none of them fetches. They are real routes so the back button and deep links
 * still work.
 */
export const VIEWS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: "/", icon: List, label: copy.nav.list },
  { href: "/board", icon: Columns3, label: copy.nav.board },
  { href: "/calendar", icon: CalendarDays, label: copy.nav.calendar },
  /*
    A fourth view rather than a settings page: it answers « what happened »,
    which is a question about the work, not about the workspace.
  */
  { href: "/activity", icon: History, label: copy.nav.activity },
];

export function ViewSwitch() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5" aria-label={copy.nav.list}>
      {VIEWS.map(({ href, icon: Icon, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-sm px-2 py-1 text-[13px]",
              active
                ? "bg-surface-hover text-fg"
                : "text-fg-muted hover:text-fg",
            )}
          >
            <Icon className="size-4" strokeWidth={1.5} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
