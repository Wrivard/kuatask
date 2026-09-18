"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { CHECK_LENGTH, CHECK_PATH, COMPLETION, SETTLE } from "@/lib/motion";

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

// the geometry lives in lib/motion.ts, where verify:logic can assert it

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
    /*
      The row toggles too, now, so without this a click here would toggle twice
      and land back where it started. The row's own handler already ignores
      clicks that hit a control, so this is the second of two guards rather than
      the only one — but it is the one that is local to the thing being clicked.
    */
    e.stopPropagation();
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
      transition={{
        duration: SETTLE.checkboxScale / 1000,
        times: SETTLE.checkboxTimes,
      }}
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
