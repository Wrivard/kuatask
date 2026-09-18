"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * The mobile overflow, in its own file so it can be loaded when it is opened.
 *
 * Radix's Sheet is ~14 kB, and inlining it in `bottom-bar.tsx` put that into the
 * first load of every route — for a panel that only exists under `lg` and is
 * opened occasionally. The day sheet has always been dynamic for the same
 * reason. Splitting it out is what lets `next/dynamic` do its job: a dynamic
 * import of a symbol declared in the importing file saves nothing.
 */
export function MoreSheet({
  open,
  onOpenChange,
  items,
  isActive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: { href: string; icon: LucideIcon; label: string }[];
  isActive: (href: string) => boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-lg border-border bg-surface">
        <SheetHeader>
          <SheetTitle className="text-[15px]">{copy.nav.more}</SheetTitle>
        </SheetHeader>

        <ul className="flex flex-col p-2 pb-6">
          {items.map(({ href, icon: Icon, label }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => onOpenChange(false)}
                aria-current={isActive(href) ? "page" : undefined}
                // 44px minimum, like every other target under a thumb
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-sm px-3 text-[15px]",
                  isActive(href) ? "bg-surface-hover text-fg" : "text-fg-muted",
                )}
              >
                <Icon className="size-[18px] shrink-0" strokeWidth={1.5} aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
