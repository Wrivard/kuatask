import { ProgressRing } from "./progress-ring";
import { ViewSwitch } from "./view-switch";

/**
 * Title, then the three view tabs, then the progress ring.
 *
 * Nothing else ever goes here: no search field (that is ⌘K), no avatar menu
 * (that is settings), no "+ New" (that is the composer).
 */
export function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-border px-6">
      <h1 className="shrink-0 text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
      <div className="hidden lg:block">
        <ViewSwitch />
      </div>
      <div className="ml-auto">
        <ProgressRing />
      </div>
    </header>
  );
}
