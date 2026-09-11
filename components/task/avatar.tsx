"use client";

import * as React from "react";
import { accentColor } from "./assignee-dot";
import type { Profile } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * A person, at a size where a 6px dot says nothing.
 *
 * The dot is right in a 44px row — it is one of six things competing for the
 * line, and identity there only has to be distinguishable, not legible. But
 * assignment is *chosen* in the modal and on the board, where there is room,
 * and a coloured circle with no content makes those screens feel like a form
 * rather than like two people dividing work.
 *
 * Initials on the accent when there is no image. That is the placeholder and it
 * is deliberately not a grey silhouette: the colour is already the person's
 * everywhere else in the app, so the fallback reinforces the same association
 * the dot does rather than introducing a second, emptier one.
 *
 * Never a broken image. An `avatar_url` that fails to load falls back to the
 * initials rather than to the browser's torn-page icon, because a face that
 * half-loads is worse than one that was never claimed.
 */
const SIZES = {
  sm: "size-5 text-[9px]",
  md: "size-6 text-[10px]",
  lg: "size-9 text-[13px]",
} as const;

export function Avatar({
  member,
  size = "md",
  className,
}: {
  member: Pick<Profile, "display_name" | "accent" | "avatar_url"> | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [broken, setBroken] = React.useState(false);

  // a new url deserves a fresh attempt; otherwise one failure is permanent
  React.useEffect(() => setBroken(false), [member?.avatar_url]);

  if (!member) {
    return (
      <span
        aria-hidden
        className={cn(
          "shrink-0 rounded-full border border-dashed border-control",
          SIZES[size],
          className,
        )}
      />
    );
  }

  const colour = accentColor(member.accent);
  const url = member.avatar_url;

  if (url && !broken) {
    return (
      // next/image wants a configured domain per host; this is one small avatar
      // from wherever somebody put it, so a plain img is the honest primitive
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={member.display_name}
        title={member.display_name}
        onError={() => setBroken(true)}
        className={cn("shrink-0 rounded-full object-cover", SIZES[size], className)}
        style={{ boxShadow: `0 0 0 1px ${colour}` }}
      />
    );
  }

  return (
    <span
      title={member.display_name}
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-medium",
        SIZES[size],
        className,
      )}
      // the accent at low opacity with the accent as text: legible on both
      // themes without needing a second colour per person
      style={{ backgroundColor: `${colour}33`, color: colour }}
    >
      {initials(member.display_name)}
    </span>
  );
}

/**
 * One letter, or two when the name has two words.
 *
 * `Array.from` rather than `slice`, so a name starting with an emoji or an
 * accented character outside the basic plane does not come back as half a
 * codepoint.
 */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (Array.from(words[0])[0] ?? "?").toUpperCase();
  return (
    (Array.from(words[0])[0] ?? "") + (Array.from(words[words.length - 1])[0] ?? "")
  ).toUpperCase();
}
