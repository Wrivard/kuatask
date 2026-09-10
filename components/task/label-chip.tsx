"use client";

import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * The free-text client tag. No colour of its own — colour is reserved for the
 * accent and for identity dots, so the chip earns its separation from hairlines.
 *
 * Clickable where the surrounding view can do something with it. It stays a
 * span otherwise rather than a disabled button: a control that does nothing is
 * worse than no control.
 */
export function LabelChip({
  label,
  onSelect,
}: {
  label: string;
  onSelect?: (label: string) => void;
}) {
  const className = cn(
    "shrink-0 truncate rounded-sm border border-border px-1.5 py-px text-[12px] text-fg-muted",
    onSelect && "hover:border-control hover:text-fg",
  );

  if (!onSelect) return <span className={className}>#{label}</span>;

  return (
    <button
      type="button"
      title={copy.task.filterByLabel(label)}
      // the row underneath opens the modal on click
      onClick={(e) => {
        e.stopPropagation();
        onSelect(label);
      }}
      className={className}
    >
      #{label}
    </button>
  );
}
