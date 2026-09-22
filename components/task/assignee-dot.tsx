"use client";

import { motion, useReducedMotion } from "motion/react";
import { spring } from "@/lib/motion";
import { Avatar } from "./avatar";
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

/**
 * Who a task belongs to, as their face.
 *
 * This was a 6px dot, which `docs/04` describes as the identity treatment and
 * which is genuinely enough to *distinguish* two people. It is not enough to
 * recognise one. The owner asked for the picture on the card, and the reason
 * given the first time an avatar went into this app still holds: two people
 * dividing work should not be two shades of a 6px circle.
 *
 * The colour survives — `Avatar` falls back to initials on the accent, so a
 * person with no picture still reads as their colour and nothing regresses for
 * whoever has not set one. It is a superset of the dot rather than a
 * replacement for it.
 *
 * Still named for the three jobs rather than the shape, which is why it is no
 * longer called a dot: identity, the § 8.7 pulse when the other person
 * completes something on your screen, and the optional tap that narrows the
 * list to one person.
 */
/**
 * A task that belongs to both of you: two faces, overlapping.
 *
 * Deliberately not a third colour or a « 2 » badge — the two people are the
 * information, and the same faces that mean "his" and "mine" everywhere else
 * mean "ours" when they sit together.
 */
export function SharedFaces({
  members,
  onSelect,
}: {
  members: Profile[];
  onSelect?: (id: string) => void;
}) {
  if (members.length === 0) return null;

  const faces = (
    <span className="flex shrink-0 -space-x-1.5" title={copy.task.shared}>
      {members.map((m) => (
        <Avatar key={m.id} member={m} size="sm" className="ring-1 ring-bg" />
      ))}
    </span>
  );

  // the same 36px target the single face gets, without moving its neighbours
  if (!onSelect) return faces;
  return (
    <button
      type="button"
      title={copy.task.shared}
      aria-label={copy.task.shared}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(members[0].id);
      }}
      className="-m-2 flex shrink-0 items-center justify-center rounded-full p-2"
    >
      {faces}
    </button>
  );
}

export function AssigneeFace({
  member,
  pulse = false,
  onSelect,
}: {
  member: Profile | undefined;
  /** Pulses once when the other person completes a task on your screen. */
  pulse?: boolean;
  /** Makes it a way to switch the lens to that person. */
  onSelect?: (id: string) => void;
}) {
  const reduced = useReducedMotion();

  /*
    Nothing at all when nobody owns it.

    The dot left a 6px spacer here. `Avatar` would draw its dashed placeholder,
    which is right in the modal where you are choosing an assignee and wrong on
    a row, where every unowned task would grow an empty circle asking to be
    filled. Unassigned is the common case for something just captured, and the
    absence already says it.
  */
  if (!member) return null;

  // a scale pulse becomes an opacity blink, so the signal survives either way
  const pulseAnimation = reduced ? { opacity: [1, 0.3, 1] } : { scale: [1, 1.25, 1] };

  const face = (
    <motion.span
      className="flex shrink-0"
      title={onSelect ? undefined : member.display_name}
      animate={pulse ? pulseAnimation : { scale: 1, opacity: 1 }}
      transition={pulse ? { duration: 0.45, times: [0, 0.4, 1] } : reduced ? { duration: 0 } : spring}
    >
      <Avatar member={member} size="sm" />
    </motion.span>
  );

  if (!onSelect) return face;

  /*
    The padding gives a 20px face a 36px target without moving anything around
    it, which matters more under a thumb than under a cursor. The dot needed
    this to reach 22px; the face starts larger, so the same trick lands it on a
    comfortable target rather than a merely legal one.
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
      className="-m-2 flex shrink-0 items-center justify-center rounded-full p-2"
    >
      {face}
    </button>
  );
}
