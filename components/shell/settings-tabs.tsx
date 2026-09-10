"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/** Two settings pages: yours, and the workspace's. */
const TABS = [
  { href: "/settings", label: copy.settings.profile },
  { href: "/settings/people", label: copy.people.title },
];

/*
  These two pages fetch on the server, so a click on a cold connection does
  nothing visible for a moment and reads as a dead tab. This is the one place
  in the app that admits to waiting — everything on the task surfaces is
  optimistic and has nothing to wait for.

  A rule under the label rather than a spinner: it is the tab's own underline,
  arriving early.
*/
function Pending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      aria-hidden
      className="absolute inset-x-2 -bottom-px h-px animate-pulse bg-fg-muted"
    />
  );
}

export function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5 border-b border-border px-6">
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px border-b px-2 py-2 text-[13px]",
              active
                ? "border-fg text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {label}
            <Pending />
          </Link>
        );
      })}
    </nav>
  );
}
