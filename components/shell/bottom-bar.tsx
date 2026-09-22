"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  BarChart3,
  CalendarDays,
  Columns3,
  History,
  List,
  MoreHorizontal,
  NotebookPen,
  Plus,
  Receipt,
  Users,
  type LucideIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { focusComposer } from "@/lib/events";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Mobile navigation, replacing the sidebar under lg.
 *
 * Padded by the bottom safe-area inset so it cannot sit under the home
 * indicator on a notched device, and every target clears 44px. No keyboard
 * hints are rendered here — none of the shortcut map applies on touch.
 */
const ITEMS: { href: string; icon: LucideIcon; label: string }[] = [
  { href: "/", icon: List, label: copy.nav.list },
  /*
    On the bar rather than behind « Plus », because dumping on a phone and
    reorganising on a laptop is the workflow this page was asked for. Six
    tabs at 375px is 62px each, which « Calendrier » fits at 12px with a
    little to spare — seven did not, which is why the overflow exists.
  */
  { href: "/notes", icon: NotebookPen, label: copy.nav.notes },
  { href: "/board", icon: Columns3, label: copy.nav.board },
  { href: "/calendar", icon: CalendarDays, label: copy.nav.calendar },
];

/*
  Loaded when it is opened, not on every page.

  Putting Radix's Sheet in this file put 14 kB of dialog into the first load of
  all six routes — for a menu that is mobile-only and opened rarely. The day
  sheet has always been dynamic for the same reason; this one forgot to be, and
  the route sizes said so immediately.
*/
const MoreSheet = dynamic(() => import("./more-sheet").then((m) => m.MoreSheet));

/*
  The destinations that do not fit on the bar.

  Six routes, five slots — and the rail that holds all six is `lg:` only, so
  Activité and Classement had no way in on a phone at all. Adding them would
  have made seven tabs at 54px each, which is narrower than the word
  « Calendrier ».

  So the bar keeps what you move between while working, and the rest is one tap
  behind « Plus ». Réglages goes here rather than staying on the bar because it
  is the one you open least: changing your colour is not navigation.
*/
const MORE: { href: string; icon: LucideIcon; label: string }[] = [
  { href: "/billing", icon: Receipt, label: copy.nav.billing },
  { href: "/activity", icon: History, label: copy.nav.activity },
  { href: "/stats", icon: BarChart3, label: copy.nav.stats },
  { href: "/settings", icon: Users, label: copy.nav.settings },
];

export function BottomBar() {
  const pathname = usePathname();

  const [moreOpen, setMoreOpen] = React.useState(false);

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

      <Tab
        icon={MoreHorizontal}
        label={copy.nav.more}
        onClick={() => setMoreOpen(true)}
        active={MORE.some((m) => isActive(m.href))}
      />

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} items={MORE} isActive={isActive} />
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
