"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * The two halves of Facturation: the clients, and the things we sell them.
 *
 * A tab strip rather than a rail entry, because the price list is not a place
 * you go — it is the other side of this one page, opened when a price changes
 * and closed again.
 */
const TABS = [
  { href: "/billing", label: copy.billing.tabClients },
  { href: "/billing/produits", label: copy.billing.tabProducts },
];

export function BillingTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-5 flex items-center gap-1" aria-label={copy.nav.billing}>
      {TABS.map(({ href, label }) => {
        // a client's own sheet belongs to the clients side
        const active = href === "/billing" ? !pathname.startsWith("/billing/produits") : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-sm px-2.5 py-1.5 text-[13px] transition-colors",
              active ? "bg-surface-hover font-medium text-fg" : "text-fg-muted hover:bg-surface hover:text-fg",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
