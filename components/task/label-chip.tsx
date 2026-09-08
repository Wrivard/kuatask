/**
 * The free-text client tag. No colour of its own — colour is reserved for the
 * accent and for identity dots, so the chip earns its separation from hairlines.
 */
export function LabelChip({ label }: { label: string }) {
  return (
    <span className="shrink-0 truncate rounded-sm border border-border px-1.5 py-px text-[12px] text-fg-muted">
      #{label}
    </span>
  );
}
