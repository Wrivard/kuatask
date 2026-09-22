"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VIEWS } from "./view-switch";
import { copy } from "@/lib/copy";

/** A reference, not a feature. No animation beyond the standard dialog spring. */
const GROUPS: { scope: string; rows: [string, string][] }[] = [
  {
    scope: copy.shortcuts.scopeGlobal,
    rows: [
      ["⌘K", copy.palette.placeholder],
      ["C", copy.composer.placeholder],
      ["/", copy.search.placeholder],
      // only meaningful while the composer has something in it, but this is the
      // sheet somebody opens to find out that it exists at all
      ["Maj+Entrée", copy.composer.openHint],
      ["1 2 3 4", `${copy.nav.today} / ${copy.nav.tomorrow} / ${copy.nav.week} / ${copy.nav.month}`],
      /*
        From VIEWS as well. A sheet that lists five of six shortcuts is worse
        than one that lists none, because it reads as complete.
      */
      ...VIEWS.map(
        (v) => [`G puis ${v.key.toUpperCase()}`, v.label] as [string, string],
      ),
      ["G puis S", copy.nav.settings],
      ["⌘Z", copy.toast.undo],
      ["?", copy.shortcuts.title],
    ],
  },
  {
    scope: copy.shortcuts.scopeList,
    rows: [
      ["J / K", copy.shortcuts.moveFocus],
      ["X", copy.nav.done],
      ["E", copy.shortcuts.open],
      ["S", copy.task.status],
      ["A", copy.task.assignee],
      ["D", copy.task.dueDate],
      ["!", copy.task.important],
      ["⌫", copy.task.delete],
    ],
  },
  {
    scope: copy.shortcuts.scopeBoard,
    rows: [
      ["← →", copy.shortcuts.moveCard],
      ["X", copy.nav.done],
      [copy.shortcuts.enter, copy.shortcuts.open],
    ],
  },
  {
    scope: copy.shortcuts.scopeCalendar,
    rows: [
      ["← →", copy.shortcuts.months],
      ["↑↓←→", copy.shortcuts.gridFocus],
      [copy.shortcuts.enter, copy.shortcuts.openDay],
      ["M", `${copy.nav.month} / ${copy.nav.week}`],
      ["T", copy.nav.today],
      [copy.shortcuts.drag, copy.shortcuts.dragDate],
    ],
  },
  /*
    The billing sheet has keys of its own, borrowed from the spreadsheet it
    replaces. A sheet that behaves like Excel only helps if you know it does.
  */
  {
    scope: copy.shortcuts.scopeBilling,
    rows: [
      [copy.shortcuts.enter, copy.shortcuts.cellDown],
      [copy.shortcuts.shiftEnter, copy.shortcuts.cellUp],
      [copy.shortcuts.escape, copy.shortcuts.cellRevert],
      [copy.shortcuts.paste, copy.shortcuts.pasteRows],
    ],
  },
];

export function ShortcutSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-[440px] rounded-lg border-border bg-surface">
        <DialogTitle className="text-[15px] font-medium">
          {copy.shortcuts.title}
        </DialogTitle>

        <div className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <section key={group.scope}>
              <h3 className="mb-2 text-[13px] font-medium text-fg-muted">
                {group.scope}
              </h3>
              <ul className="flex flex-col gap-1.5">
                {group.rows.map(([keys, action]) => (
                  <li key={keys} className="flex items-baseline gap-3">
                    <kbd className="shrink-0 rounded-sm border border-border px-1.5 py-px font-mono text-[12px] text-fg-muted">
                      {keys}
                    </kbd>
                    <span className="text-[13px] text-fg-muted">{action}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
