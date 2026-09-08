"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { SWEEP_DURATION } from "@/lib/motion";
import { copy } from "@/lib/copy";

/**
 * § 8.5 — the one orchestrated moment in the app that a user did not directly
 * trigger. Everything else animates only in response to a direct action.
 *
 * A single narrow band of light sweeps once and is gone, then the list settles.
 * No confetti, no modal, no badge, no trophy, no extra sound. Restraint is what
 * makes this land the twentieth time instead of becoming something to click
 * past. Under reduced motion the sweep is skipped and the settled state
 * crossfades in.
 */
export function ClearOut({
  completedToday,
  streak,
  seed,
}: {
  completedToday: number;
  streak: number;
  /** Rotates the copy so it does not go stale by the second week. */
  seed: number;
}) {
  const reduced = useReducedMotion();
  const line = copy.clearOut[seed % copy.clearOut.length];

  return (
    <div className="relative overflow-hidden py-10">
      {!reduced && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 h-24"
          style={{
            background:
              "linear-gradient(180deg, transparent, color-mix(in oklab, var(--color-accent) 14%, transparent), transparent)",
          }}
          initial={{ top: "-6rem" }}
          animate={{ top: "100%" }}
          transition={{ duration: SWEEP_DURATION / 1000, ease: "easeInOut" }}
        />
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, delay: reduced ? 0 : 0.2 }}
        className="flex flex-col gap-1"
      >
        <p className="text-[15px] text-fg">{line}</p>
        <p className="font-mono text-[12px] tabular-nums text-fg-faint">
          {completedToday}
          {streak > 0 && <> · {copy.streak(streak)}</>}
        </p>
      </motion.div>
    </div>
  );
}
