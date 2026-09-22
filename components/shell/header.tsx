import { ProgressRing } from "./progress-ring";
import { SearchBar } from "./search-bar";

/**
 * Title, the search box, then the progress ring.
 *
 * The three view tabs used to sit here as well, duplicated by the rail on the
 * left and the bar at the bottom — three copies of the same navigation, none of
 * them obviously the one to use. They live in the rail now, which is where a
 * person looks for navigation, and in the bottom bar under lg.
 *
 * The search box is the exception to what this file used to say, and it was
 * wrong: search lived in the composer, so starting it changed a placeholder and
 * a border on a field that already looked like a field, and on every screen
 * except the list it did nothing at all, because the composer it needed was not
 * there. Twice reported as "I cannot search". A thing people need to find has to
 * be visible, and the header is the one strip present on every page.
 *
 * Nothing else goes here: no avatar menu (that is settings), no "+ New" (that is
 * the composer).
 */
export function Header({
  title,
  search = true,
}: {
  title: string;
  /**
   * Off where the page has its own search. On Facturation the box searched
   * tasks — typing a client's name into it left the page for the task list,
   * which is not what anybody looking at a client list meant.
   */
  search?: boolean;
}) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border px-6">
      {/*
        Hidden on a phone, where 255px has to hold a title and a search box and
        « Aujourd'hui » alone is 133 of them. The bottom bar already says which
        view you are on, so the title is the repetition and the search box is the
        thing you cannot get at any other way.

        `flex-1`, not `shrink-0`: `truncate` only works on an item allowed to
        shrink, so the two together meant a long title pushed the search box and
        the ring off the end instead of ellipsing.
      */}
      <h1 className="hidden min-w-0 flex-1 truncate text-[22px] font-semibold tracking-[-0.02em] sm:block">
        {title}
      </h1>

      {/* fixed, so the title gives way first and the ring never moves */}
      {search ? (
        <div className="flex min-w-0 flex-1 justify-end sm:w-[220px] sm:flex-none lg:w-[280px]">
          <SearchBar />
        </div>
      ) : (
        // keeps the ring at the right edge on a phone, where the title is hidden
        <div className="flex-1 sm:hidden" />
      )}

      <ProgressRing />
    </header>
  );
}
