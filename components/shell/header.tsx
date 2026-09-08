import { ProgressRing } from "./progress-ring";

/**
 * Page title on the left, the progress ring and remaining count on the right.
 * Nothing else ever goes here: no search field (that is ⌘K), no avatar menu
 * (that is settings), no "+ New" (that is the composer).
 */
export function Header({ title }: { title: string }) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{title}</h1>
      <ProgressRing />
    </header>
  );
}
