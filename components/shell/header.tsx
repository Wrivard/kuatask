import { ProgressRing } from "./progress-ring";

/**
 * Title, then the progress ring. That is all.
 *
 * The three view tabs used to sit here as well, duplicated by the rail on the
 * left and the bar at the bottom — three copies of the same navigation, none of
 * them obviously the one to use. They live in the rail now, which is where a
 * person looks for navigation, and in the bottom bar under lg.
 *
 * Nothing else ever goes here: no search field (that is ⌘K), no avatar menu
 * (that is settings), no "+ New" (that is the composer).
 */
export function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border px-6">
      <h1 className="min-w-0 flex-1 truncate text-[22px] font-semibold tracking-[-0.02em]">
        {title}
      </h1>
      <ProgressRing />
    </header>
  );
}
