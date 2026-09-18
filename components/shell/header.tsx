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
export function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border px-6">
      <h1 className="min-w-0 shrink-0 truncate text-[22px] font-semibold tracking-[-0.02em]">
        {title}
      </h1>

      {/* takes the slack, so the title keeps its width and the ring stays put */}
      <div className="flex min-w-0 flex-1 justify-end">
        <SearchBar />
      </div>

      <ProgressRing />
    </header>
  );
}
