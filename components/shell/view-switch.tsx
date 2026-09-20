"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Columns3,
  History,
  List,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";
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
/**
 * The routes, with an icon each.
 *
 * The data lives in `lib/routes.ts` so it can be loaded without React — which
 * is what lets `verify:logic` assert that no two routes claim the same `g` key.
 * This file only adds the part that needs a component.
 */
const ICONS: Record<string, LucideIcon> = {
  "/notes": NotebookPen,
  "/": List,
  "/board": Columns3,
  "/calendar": CalendarDays,
  "/activity": History,
  "/stats": BarChart3,
};

export const VIEWS = ROUTES.map((route) => ({
  ...route,
  icon: ICONS[route.href] ?? List,
}));

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
