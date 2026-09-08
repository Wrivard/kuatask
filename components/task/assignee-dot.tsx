"use client";

import { motion, useReducedMotion } from "motion/react";
import { spring } from "@/lib/motion";
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
}: {
  member: Profile | undefined;
  /** Pulses once when the other person completes a task on your screen. */
  pulse?: boolean;
}) {
  const reduced = useReducedMotion();

  if (!member) return <span className="size-1.5 shrink-0" aria-hidden />;

  // a scale pulse becomes an opacity blink, so the signal survives either way
  const pulseAnimation = reduced ? { opacity: [1, 0.3, 1] } : { scale: [1, 2.1, 1] };

  return (
    <motion.span
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: accentColor(member.accent) }}
      title={member.display_name}
      animate={pulse ? pulseAnimation : { scale: 1, opacity: 1 }}
      transition={pulse ? { duration: 0.45, times: [0, 0.4, 1] } : reduced ? { duration: 0 } : spring}
    />
  );
}
