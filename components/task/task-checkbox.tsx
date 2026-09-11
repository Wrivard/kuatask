"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { COMPLETION } from "@/lib/motion";

/**
 * The completion sequence, docs/08-satisfaction.md § 8.1.
 *
 * Everything starts at 0ms with no network wait. The checkmark DRAWS via
 * stroke-dashoffset rather than appearing — that distinction is most of the
 * effect, and swapping it for a fade quietly removes the payoff.
 *
 * Under reduced motion the wipe and the draw become an opacity crossfade. The
 * completion tone is deliberately NOT suppressed there (§ 8.2) — it is the
 * accessible channel for someone who turned animation off.
 */

// length of the checkmark path below, measured once so dashoffset can animate it
const CHECK_PATH = "M3.5 7.2 L6.2 9.9 L10.5 4.3";
const CHECK_LENGTH = 13.2;

export function TaskCheckbox({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const reduced = useReducedMotion();

  function handle(e: React.MouseEvent) {
    e.stopPropagation(); // the rest of the row opens the modal
    onToggle(); // tone and haptics live in useToggleWithFeedback
  }

  return (
    <motion.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={handle}
      className="relative grid size-[18px] shrink-0 place-items-center rounded-sm border border-control"
      animate={reduced ? {} : { scale: checked ? [1, 0.88, 1.04, 1] : 1 }}
      transition={{ duration: 0.26, times: [0, 0.25, 0.6, 1] }}
    >
      {/*
        A ring leaving the box on the tick.

        Not in § 8.1, and deliberately one thing: a single circle expanding to
        2.2× and fading over 420ms. It reads as the tick having *happened*
        rather than the box having changed state, which is the same distinction
        the draw-not-fade rule is chasing one level down. Outside the overflow
        clip, so it can actually leave.
      */}
      {!reduced && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-sm border border-accent"
          initial={false}
          animate={checked ? { scale: [1, 2.2], opacity: [0.55, 0] } : { scale: 1, opacity: 0 }}
          transition={{ duration: COMPLETION.ripple / 1000, ease: "easeOut" }}
        />
      )}

      {/* accent fill wipes in from the bottom — a wipe, not a fade */}
      <motion.span
        className="absolute inset-0 overflow-hidden rounded-[1px] bg-accent"
        initial={false}
        animate={
          reduced
            ? { opacity: checked ? 1 : 0, scaleY: 1 }
            : { scaleY: checked ? 1 : 0 }
        }
        style={{ transformOrigin: "bottom" }}
        transition={{ duration: COMPLETION.fillWipe / 1000, ease: "easeOut" }}
      />

      <svg
        viewBox="0 0 14 14"
        className="relative size-[14px]"
        fill="none"
        stroke="var(--color-bg)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <motion.path
          d={CHECK_PATH}
          strokeDasharray={CHECK_LENGTH}
          initial={false}
          animate={
            reduced
              ? { strokeDashoffset: checked ? 0 : CHECK_LENGTH, opacity: checked ? 1 : 0 }
              : { strokeDashoffset: checked ? 0 : CHECK_LENGTH }
          }
          transition={{
            duration: COMPLETION.checkDrawDuration / 1000,
            delay: checked && !reduced ? COMPLETION.checkDrawDelay / 1000 : 0,
            ease: "easeOut",
          }}
        />
      </svg>
    </motion.button>
  );
}
