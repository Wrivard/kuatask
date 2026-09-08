import { copy } from "@/lib/copy";

/**
 * Fixed 220px, hairline divider, no shadow.
 *
 * The bucket links with live counts, the assignee filter and the streak all
 * need the store, so they arrive with it. Nothing is stubbed here in the
 * meantime — an unbuilt feature has no button.
 */
export function Sidebar({ workspaceName }: { workspaceName: string }) {
  return (
    <aside className="hidden w-[220px] shrink-0 border-r border-border md:block">
      <div className="px-4 py-4">
        <span className="text-[13px] font-medium text-fg">{workspaceName}</span>
        <span className="sr-only">{copy.app.name}</span>
      </div>
    </aside>
  );
}
