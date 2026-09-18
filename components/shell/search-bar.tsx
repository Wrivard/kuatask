"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { SEARCH_PARAM, searchHref, useStartSearch } from "@/lib/events";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * The search box, in the header, on every page.
 *
 * `docs/06` said the header holds a title and the progress ring and that search
 * is `⌘K`. That was wrong in practice and the owner reported it twice: search
 * turned the *composer* into a search box, so the only thing that changed was a
 * placeholder and a border colour, on a field that already looked like a field.
 * Pressing `/` and seeing nothing you recognise as search is indistinguishable
 * from `/` not working — and on four of the five screens it genuinely did
 * nothing, because the composer it needed only exists on the list.
 *
 * So: a real input, visibly a search box, present wherever tasks are.
 *
 * The URL is the state. `?q=` is read by the list and written by this, which
 * means one place decides what is being searched — typing here from the board
 * navigates to the results rather than filtering a view that has no search of
 * its own, the back button leaves a search, and a result set is a link.
 */

/** Long enough that a word lands as one history entry, short enough to feel live. */
const DEBOUNCE_MS = 180;

export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const fromUrl = params.get(SEARCH_PARAM) ?? "";
  const [value, setValue] = React.useState(fromUrl);

  /*
    The field is controlled locally and syncs *down* from the URL, not up.
    Driving it straight from `?q=` would make every keystroke wait for a
    navigation, which is the one thing this app does not do anywhere else.
  */
  React.useEffect(() => setValue(fromUrl), [fromUrl]);

  // `/` from anywhere lands here now, rather than in the composer
  useStartSearch((incoming) => {
    if (incoming) setValue(incoming);
    inputRef.current?.focus();
    inputRef.current?.select();
  });

  const commit = React.useCallback(
    (next: string) => {
      const trimmed = next.trim();

      /*
        `replace` while already searching, `push` on the way in. Otherwise every
        letter typed would be a history entry to walk back through, and the way
        out of a search would be twelve presses of Back.
      */
      const onList = pathname === "/";
      const go = onList && fromUrl !== "" ? router.replace : router.push;

      go(trimmed === "" ? "/" : searchHref(trimmed), { scroll: false });
    },
    [pathname, fromUrl, router],
  );

  React.useEffect(() => {
    if (value === fromUrl) return;
    const id = setTimeout(() => commit(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value, fromUrl, commit]);

  function clear() {
    setValue("");
    commit("");
    inputRef.current?.focus();
  }

  return (
    // the header decides how wide; this only fills what it is given
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-fg-faint"
        strokeWidth={1.5}
        aria-hidden
      />

      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // Escape empties it and hands focus back, rather than leaving a filter on
          if (e.key === "Escape") {
            e.preventDefault();
            if (value === "") inputRef.current?.blur();
            else clear();
          }
        }}
        placeholder={copy.search.placeholder}
        aria-label={copy.search.placeholder}
        className={cn(
          "h-8 w-full rounded-sm border border-control bg-bg pl-7 text-[13px] text-fg",
          value === "" ? "pr-2" : "pr-7",
          "placeholder:text-fg-faint focus-visible:border-accent",
          // Safari draws its own clear button on type=search; this one is ours
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />

      {value !== "" && (
        <button
          type="button"
          onClick={clear}
          title={copy.search.clear}
          aria-label={copy.search.clear}
          className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-sm text-fg-faint hover:bg-surface-hover hover:text-fg"
        >
          <X className="size-3.5" strokeWidth={1.5} aria-hidden />
        </button>
      )}
    </div>
  );
}
