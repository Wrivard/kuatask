"use client";

import * as React from "react";

/**
 * What is half-typed in a composer, kept across a view switch.
 *
 * The three views are real routes, so glancing at the calendar mid-sentence
 * unmounts the composer and throws the sentence away. Capture is the one thing
 * this app has to never lose, and "I typed it, then I looked at something, then
 * it was gone" is the worst possible way to lose it.
 *
 * In memory, not sessionStorage: a draft should survive a glance, not a reload.
 * After a reload an empty box is the right thing to come back to.
 */
const drafts = new Map<string, string>();

/**
 * Forgets every draft. Called on sign-out: a half-typed task title is the
 * user's, and the map is module-level, so without this it would still be there
 * for whoever signs in next on the same machine.
 */
export function clearDrafts() {
  drafts.clear();
}

export function useDraft(key: string): [string, (next: string) => void] {
  const [value, setValue] = React.useState(() => drafts.get(key) ?? "");

  // a different composer (the day sheet's, say) has its own line
  React.useEffect(() => {
    setValue(drafts.get(key) ?? "");
  }, [key]);

  const write = React.useCallback(
    (next: string) => {
      setValue(next);
      if (next === "") drafts.delete(key);
      else drafts.set(key, next);
    },
    [key],
  );

  return [value, write];
}
