"use client";

import * as React from "react";
import { addDays, nextDay } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { DatePicker } from "./date-picker";
import { useStore, type Task } from "@/lib/store";
import { useSetStatusWithFeedback } from "@/lib/completion";
import { useAutoGrow } from "@/lib/auto-grow";
import { labelsInUse } from "@/lib/suggest";
import { copy } from "@/lib/copy";
import {
  today,
  tomorrow,
  toDayString,
  nowTz,
  formatDueLabel,
  instantToDay,
} from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Every field saves on change, optimistically. There is no save button and no
 * cancel — a Save/Cancel pair makes the user responsible for a transaction they
 * did not ask to open. Esc closes, ⌘Enter closes, ⌘Backspace deletes.
 *
 * Text fields debounce before they write. The store pushes an undo entry per
 * mutation, and a write per keystroke would bury the 20-entry stack under one
 * sentence of typing.
 *
 * Layout is three bands: the task itself, then its metadata, then the actions.
 * Only the middle one scrolls, so a task with long notes cannot push Supprimer
 * off the bottom of the window.
 */
const TEXT_DEBOUNCE = 400;

/** Workflow order, which is not the enum's declaration order. */
const STATUSES: { value: Task["status"]; label: string }[] = [
  { value: "todo", label: copy.board.todo },
  { value: "doing", label: copy.board.doing },
  { value: "done", label: copy.board.done },
];

export function TaskModal({
  taskId,
  onClose,
}: {
  taskId: string | null;
  onClose: () => void;
}) {
  /*
    Radix returns focus to whatever held it when the dialog opened. Clicking a
    row that is the row; opening with E from the keyboard it is <body>, so focus
    fell to the top of the document and J/K started from the beginning again.
    The row carries data-task-id, so it can be found and focused directly.
  */
  const openedFrom = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (taskId) {
      const active = document.activeElement;
      openedFrom.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
    }
  }, [taskId]);

  const restoreFocus = React.useCallback((id: string | null) => {
    if (openedFrom.current) return; // Radix will handle it
    const row = id
      ? document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)
      : null;
    row?.focus();
  }, []);

  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const members = useStore((s) => s.members);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setStatus = useSetStatusWithFeedback();

  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [picking, setPicking] = React.useState(false);

  // both fields size themselves to their content — docs/06-views.md
  const titleRef = useAutoGrow<HTMLTextAreaElement>(title);
  const notesRef = useAutoGrow<HTMLTextAreaElement>(notes);

  // reset the local text buffers when a different task opens
  React.useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setPicking(false);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced title/notes writes
  React.useEffect(() => {
    if (!task) return;
    if (title === task.title || title.trim() === "") return;
    const id = setTimeout(
      () => updateTask(task.id, { title: title.trim() }),
      TEXT_DEBOUNCE,
    );
    return () => clearTimeout(id);
  }, [title]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!task) return;
    const next = notes.trim() === "" ? null : notes;
    if (next === task.notes) return;
    const id = setTimeout(() => updateTask(task.id, { notes: next }), TEXT_DEBOUNCE);
    return () => clearTimeout(id);
  }, [notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const creator = members.find((m) => m.id === task?.created_by);

  const allTasks = useStore((s) => s.tasks);
  const knownLabels = React.useMemo(() => labelsInUse(allTasks), [allTasks]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!task) return;
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onClose();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
      e.preventDefault();
      deleteTask(task.id);
      onClose();
    }
  }

  if (!task) return null;

  const quickDates: { label: string; value: string }[] = [
    { label: copy.task.quickToday, value: today() },
    { label: copy.task.quickTomorrow, value: tomorrow() },
    { label: copy.task.quickMonday, value: toDayString(nextDay(nowTz(), 1)) },
    { label: copy.task.quickNextWeek, value: toDayString(addDays(nowTz(), 7)) },
  ];

  const setDue = (day: string | null) => {
    updateTask(task.id, { due_on: day, ...(day === null ? { due_time: null } : {}) });
    setPicking(false);
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (open) return;
        const id = task.id;
        onClose();
        // after the dialog has released the focus trap
        requestAnimationFrame(() => restoreFocus(id));
      }}
    >
      <DialogContent
        onKeyDown={handleKeyDown}
        className="flex max-h-[88dvh] w-[calc(100vw-2rem)] max-w-[540px] flex-col gap-0 overflow-hidden rounded-lg border-border bg-surface p-0 sm:max-w-[540px]"
      >
        <DialogTitle className="sr-only">{task.title}</DialogTitle>

        {/* the two text fields are the task; everything below the rule is about it */}
        <div className="shrink-0 border-b border-border px-5 pb-4 pr-12 pt-5">
          <Textarea
            ref={titleRef}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={copy.task.titlePlaceholder}
            rows={1}
            className="min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-[17px] font-medium leading-[1.35] tracking-[-0.014em] text-fg shadow-none focus-visible:ring-0 dark:bg-transparent"
          />

          <Textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={copy.task.notesPlaceholder}
            rows={1}
            className="mt-2 min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-[13px] leading-[1.55] text-fg-muted shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <Field label={copy.task.status}>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((option) => (
                <Chip
                  key={option.value}
                  active={task.status === option.value}
                  onClick={() => setStatus(task.id, option.value)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label={copy.task.dueDate}>
            <div className="flex flex-wrap gap-1.5">
              {quickDates.map((q) => (
                <Chip
                  key={q.label}
                  active={task.due_on === q.value}
                  onClick={() => setDue(q.value)}
                >
                  {q.label}
                </Chip>
              ))}
              {/*
                The quick options cover what gets set most often, but "le 23" is
                a real thing to want and there was no way to say it without
                leaving for the calendar and dragging the card.
              */}
              <Chip
                active={picking}
                onClick={() => setPicking((v) => !v)}
                aria-expanded={picking}
              >
                <CalendarDays className="size-3" strokeWidth={1.5} aria-hidden />
                {copy.task.pickDate}
              </Chip>
            </div>

            {picking && <DatePicker value={task.due_on} onSelect={setDue} />}

            <div className="mt-0.5 flex items-center gap-2">
              <span className="text-[12px] text-fg-faint">
                {task.due_on ? formatDueLabel(task.due_on) : copy.task.noDate}
              </span>

              {/* a time only means something once there is a day to hang it on */}
              {task.due_on && (
                <>
                  <Input
                    type="time"
                    aria-label={copy.task.time}
                    value={task.due_time?.slice(0, 5) ?? ""}
                    onChange={(e) =>
                      updateTask(task.id, { due_time: e.target.value || null })
                    }
                    className="h-7 w-[104px] rounded-md border-border bg-bg text-[12px] dark:bg-bg"
                  />
                  <button
                    type="button"
                    onClick={() => setDue(null)}
                    className="ml-auto flex items-center gap-1 rounded-sm px-1.5 py-1 text-[12px] text-fg-faint hover:text-fg"
                  >
                    <X className="size-3" strokeWidth={1.5} aria-hidden />
                    {copy.task.removeDate}
                  </button>
                </>
              )}
            </div>
          </Field>

          <Field label={copy.task.assignee}>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={task.assignee_id === null}
                onClick={() => updateTask(task.id, { assignee_id: null })}
              >
                {copy.task.nobody}
              </Chip>
              {members.map((m) => (
                <Chip
                  key={m.id}
                  active={task.assignee_id === m.id}
                  onClick={() => updateTask(task.id, { assignee_id: m.id })}
                >
                  {m.display_name}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label={copy.task.label}>
            {/*
              The composer completes labels and this field did not, which is how
              one client ends up spelled three ways. A native datalist rather
              than the composer's own list: there is no token to parse here, the
              whole field is the value, and the browser already knows how to
              offer a set of them.
            */}
            <Input
              list="kua-labels"
              defaultValue={task.label ?? ""}
              onBlur={(e) => updateTask(task.id, { label: e.target.value.trim() || null })}
              placeholder={copy.task.label}
              className="h-8 max-w-[260px] rounded-md border-border bg-bg text-[13px] dark:bg-bg"
            />
            <datalist id="kua-labels">
              {knownLabels.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </Field>

          <div className="flex items-center gap-3">
            <FieldLabel>{copy.task.important}</FieldLabel>
            <Switch
              checked={task.important}
              onCheckedChange={(v) => updateTask(task.id, { important: v })}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              deleteTask(task.id);
              onClose();
            }}
            className="h-8 rounded-sm px-2 text-[13px] text-danger hover:text-danger"
          >
            {copy.task.delete}
          </Button>
          {/*
            "Créé par" alone left no way to tell a task typed this morning from
            one that has been sitting there since March, which is exactly what
            you want to know before deciding whether it still matters.
          */}
          <span className="text-right text-[12px] text-fg-faint">
            {creator && copy.task.createdBy(creator.display_name)}
            {creator && " · "}
            {copy.task.createdOn(formatDueLabel(instantToDay(task.created_at)))}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/*
  Labels are small caps rather than another 13px line. Every row used to be the
  same size and weight as the values under it, so the eye had nothing to anchor
  on and the whole panel read as one undifferentiated column.
*/
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-faint">
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  ...props
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"button">, "onClick" | "children">) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] transition-colors",
        active
          ? "border-accent bg-accent/10 text-fg"
          : "border-border text-fg-muted hover:border-control hover:text-fg",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
