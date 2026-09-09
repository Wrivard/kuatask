"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/** Two settings pages: yours, and the workspace's. */
const TABS = [
  { href: "/settings", label: copy.settings.profile },
  { href: "/settings/people", label: copy.people.title },
];

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
              "-mb-px border-b px-2 py-2 text-[13px]",
              active
                ? "border-fg text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
