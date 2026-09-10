"use client";

import { motion, useReducedMotion } from "motion/react";
import { spring } from "@/lib/motion";
import { copy } from "@/lib/copy";
import type { Profile } from "@/lib/store";

/**
 * Identity dots are the only colour in the app besides the reserved accent.
 * Six options, all legible on both themes — see docs/04-design-system.md.
 */
export const ACCENTS: Record<string, string> = {
  green: "#3ecf8e",
  blue: "#4a9eff",
  purple: "#a978f0",
  amber: "#e0a244",
  pink: "#ee7ab0",
  cyan: "#3ec9d6",
};

export function accentColor(accent: string | undefined): string {
  return ACCENTS[accent ?? "green"] ?? ACCENTS.green;
}

export function AssigneeDot({
  member,
  pulse = false,
  onSelect,
}: {
  member: Profile | undefined;
  /** Pulses once when the other person completes a task on your screen. */
  pulse?: boolean;
  /** Makes the dot a way to switch the lens to that person. */
  onSelect?: (id: string) => void;
}) {
  const reduced = useReducedMotion();

  if (!member) return <span className="size-1.5 shrink-0" aria-hidden />;

  // a scale pulse becomes an opacity blink, so the signal survives either way
  const pulseAnimation = reduced ? { opacity: [1, 0.3, 1] } : { scale: [1, 2.1, 1] };

  const dot = (
    <motion.span
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: accentColor(member.accent) }}
      title={onSelect ? undefined : member.display_name}
      animate={pulse ? pulseAnimation : { scale: 1, opacity: 1 }}
      transition={pulse ? { duration: 0.45, times: [0, 0.4, 1] } : reduced ? { duration: 0 } : spring}
    />
  );

  if (!onSelect) return dot;

  /*
    A 6px dot is not a target. The negative margin gives it a 22px hit area
    without moving anything around it, which matters more under a thumb than
    under a cursor.
  */
  return (
    <button
      type="button"
      title={copy.task.filterByPerson(member.display_name)}
      aria-label={copy.task.filterByPerson(member.display_name)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(member.id);
      }}
      className="-m-2 flex shrink-0 items-center justify-center p-2"
    >
      {dot}
    </button>
  );
}
