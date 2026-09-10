"use client";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { copy } from "@/lib/copy";

/** A reference, not a feature. No animation beyond the standard dialog spring. */
const GROUPS: { scope: string; rows: [string, string][] }[] = [
  {
    scope: copy.shortcuts.scopeGlobal,
    rows: [
      ["⌘K", copy.palette.placeholder],
      ["C", copy.composer.placeholder],
      ["1 2 3 4", `${copy.nav.today} / ${copy.nav.tomorrow} / ${copy.nav.week} / ${copy.nav.month}`],
      ["G puis L", copy.nav.list],
      ["G puis B", copy.nav.board],
      ["G puis C", copy.nav.calendar],
      ["⌘Z", copy.toast.undo],
      ["?", copy.shortcuts.title],
    ],
  },
  {
    scope: copy.shortcuts.scopeList,
    rows: [
      ["J / K", "Déplacer le focus"],
      ["X", copy.nav.done],
      ["E", "Ouvrir"],
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
      ["← →", "Déplacer la carte d'une colonne"],
      ["X", copy.nav.done],
      ["Entrée", "Ouvrir"],
    ],
  },
  {
    scope: copy.shortcuts.scopeCalendar,
    rows: [
      ["← →", "Mois"],
      ["M", `${copy.nav.month} / ${copy.nav.week}`],
      ["T", copy.nav.today],
      ["Glisser", "Changer la date, dans la grille ou dans le panneau du jour"],
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
      <DialogContent className="max-w-[440px] rounded-lg border-border bg-surface">
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
