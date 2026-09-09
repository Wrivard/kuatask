"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, Columns3, CalendarDays, Plus, Users, type LucideIcon } from "lucide-react";
import { focusComposer } from "@/lib/events";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation, four items, replacing the sidebar under md.
 *
 * Padded by the bottom safe-area inset so it cannot sit under the home
 * indicator on a notched device, and every target clears 44px. No keyboard
 * hints are rendered here — none of the shortcut map applies on touch.
 */
const ITEMS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: "/", icon: List, label: copy.nav.list },
  { href: "/board", icon: Columns3, label: copy.nav.board },
  { href: "/calendar", icon: CalendarDays, label: copy.nav.calendar },
  { href: "/settings", icon: Users, label: copy.nav.settings },
];

export function BottomBar() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-bg lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <Tab icon={Plus} label={copy.palette.newTask} onClick={focusComposer} />
      {ITEMS.map(({ href, icon, label }) => (
        <Tab key={href} href={href} icon={icon} label={label} active={isActive(href)} />
      ))}
    </nav>
  );
}

function Tab({
  href,
  icon: Icon,
  label,
  active = false,
  onClick,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[12px]",
    active ? "text-fg" : "text-fg-muted",
  );

  const body = (
    <>
      <Icon className="size-[18px]" strokeWidth={1.5} />
      <span>{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
