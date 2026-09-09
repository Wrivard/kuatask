"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useStore, type Task } from "@/lib/store";
import { useSetStatusWithFeedback } from "@/lib/completion";
import { useAutoGrow } from "@/lib/auto-grow";
import { copy } from "@/lib/copy";
import { today, tomorrow, toDayString, nowTz, formatDueLabel } from "@/lib/time";
import { nextDay } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Every field saves on change, optimistically. There is no save button and no
 * cancel — a Save/Cancel pair makes the user responsible for a transaction they
 * did not ask to open. Esc closes, ⌘Enter closes, ⌘Backspace deletes.
 *
 * Text fields debounce before they write. The store pushes an undo entry per
 * mutation, and a write per keystroke would bury the 20-entry stack under one
 * sentence of typing.
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
  const task = useStore((s) => s.tasks.find((t) => t.id === taskId));
  const members = useStore((s) => s.members);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const setStatus = useSetStatusWithFeedback();

  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // both fields size themselves to their content — docs/06-views.md
  const titleRef = useAutoGrow<HTMLTextAreaElement>(title);
  const notesRef = useAutoGrow<HTMLTextAreaElement>(notes);

  // reset the local text buffers when a different task opens
  React.useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? "");
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // debounced title/notes writes
  React.useEffect(() => {
    if (!task) return;
    if (title === task.title || title.trim() === "") return;
    const id = setTimeout(() => updateTask(task.id, { title: title.trim() }), TEXT_DEBOUNCE);
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

  const quickDates: { label: string; value: string | null }[] = [
    { label: copy.task.quickToday, value: today() },
    { label: copy.task.quickTomorrow, value: tomorrow() },
    { label: copy.task.quickMonday, value: toDayString(nextDay(nowTz(), 1)) },
    { label: copy.task.removeDate, value: null },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onKeyDown={handleKeyDown}
        className="max-w-[520px] gap-0 rounded-lg border-border bg-surface p-0"
      >
        <DialogTitle className="sr-only">{task.title}</DialogTitle>

        <div className="flex flex-col gap-4 p-5">
          <Textarea
            ref={titleRef}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={copy.task.titlePlaceholder}
            rows={1}
            className="min-h-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[1.4] tracking-[-0.011em] shadow-none focus-visible:ring-0"
          />

          <Textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={copy.task.notesPlaceholder}
            rows={1}
            className="min-h-0 resize-none overflow-hidden border-0 bg-transparent p-0 text-[13px] text-fg-muted shadow-none focus-visible:ring-0"
          />

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
                <button
                  key={q.label}
                  type="button"
                  onClick={() =>
                    updateTask(task.id, {
                      due_on: q.value,
                      ...(q.value === null ? { due_time: null } : {}),
                    })
                  }
                  className={cn(
                    "rounded-sm border border-border px-2 py-1 text-[12px] text-fg-muted hover:text-fg",
                    task.due_on === q.value && q.value !== null && "border-accent text-fg",
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-fg-faint">
              {task.due_on ? formatDueLabel(task.due_on) : copy.task.noDate}
            </p>
          </Field>

          {/* time only becomes meaningful once a date exists */}
          {task.due_on && (
            <Field label={copy.task.time}>
              <Input
                type="time"
                value={task.due_time?.slice(0, 5) ?? ""}
                onChange={(e) =>
                  updateTask(task.id, { due_time: e.target.value || null })
                }
                className="h-8 w-[120px] rounded-sm text-[13px]"
              />
            </Field>
          )}

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
            <Input
              defaultValue={task.label ?? ""}
              onBlur={(e) =>
                updateTask(task.id, { label: e.target.value.trim() || null })
              }
              placeholder={copy.task.label}
              className="h-8 rounded-sm text-[13px]"
            />
          </Field>

          <Field label={copy.task.important}>
            <Switch
              checked={task.important}
              onCheckedChange={(v) => updateTask(task.id, { important: v })}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
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
          {creator && (
            <span className="text-[12px] text-fg-faint">
              {copy.task.createdBy(creator.display_name)}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg-muted">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm border border-border px-2 py-1 text-[12px] text-fg-muted hover:text-fg",
        active && "border-accent text-fg",
      )}
    >
      {children}
    </button>
  );
}
