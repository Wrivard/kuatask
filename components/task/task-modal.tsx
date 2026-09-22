"use client";

import * as React from "react";
import { addDays, nextDay } from "date-fns";
import { CalendarDays, Link as LinkIcon, Slash, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { DatePicker } from "./date-picker";
import { Avatar } from "./avatar";
import { ACCENTS } from "./assignee-dot";
import { useStore, type Task } from "@/lib/store";
import { assign, assignmentOf, BOTH } from "@/lib/assignee";
import { useSetStatusWithFeedback, useDeleteWithFeedback } from "@/lib/completion";
import { useAutoGrow } from "@/lib/auto-grow";
import { textPatch } from "@/lib/edit";
import { MICRO_LABEL } from "@/lib/type";
import { labelsInUse } from "@/lib/suggest";
import { extractLinks } from "@/lib/links";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import {
  today,
  tomorrow,
  toDayString,
  nowTz,
  formatDueLabel,
  instantToDay,
} from "@/lib/time";

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
  focus,
  onClose,
}: {
  taskId: string | null;
  /**
   * Where to put the cursor, when it matters.
   *
   * Unset for the usual case: you opened a task to look at it, so the title is
   * the right place. `"notes"` comes from the composer's Shift+Enter, where the
   * title is the sentence you just typed and the notes are the reason you opened
   * anything at all.
   */
  focus?: "notes";
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
  /*
    The store's deleteTask, not the one with feedback — which is how both
    delete paths in here ended up with no undo toast at all. Every other
    surface in the app offers a way back from a deletion; the modal, where
    it is a labelled red button rather than a keystroke, offered none.
  */
  const deleteTask = useDeleteWithFeedback();
  const createTask = useStore((s) => s.createTask);
  const setStatus = useSetStatusWithFeedback();

  /*
    The three text fields, buffered together with the id of the task they belong
    to.

    One state object rather than three, because the id is what makes a flush
    safe. Switching tasks re-renders with the new `task.id` before the reset
    effect has replaced the buffers, so anything keyed on the id alone would see
    "new task, old text" for one render — and a flush on that render would write
    one task's notes onto another. Keeping the owner *inside* the buffer makes
    that state unrepresentable.
  */
  const [buf, setBuf] = React.useState({ id: "", title: "", notes: "", label: "" });
  const [picking, setPicking] = React.useState(false);

  // both fields size themselves to their content — docs/06-views.md
  const titleRef = useAutoGrow<HTMLTextAreaElement>(buf.title);
  const notesRef = useAutoGrow<HTMLTextAreaElement>(buf.notes);

  // reset the local text buffers when a different task opens
  React.useEffect(() => {
    if (!task) return;
    setBuf({
      id: task.id,
      title: task.title,
      notes: task.notes ?? "",
      label: task.label ?? "",
    });
    setPicking(false);
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Writes whatever is in the buffer that is not already saved.
   *
   * Reads the store at call time rather than closing over `task`, so it is
   * stable and can be called from an unmount cleanup — where the props are a
   * render old and the task may be gone entirely.
   */
  const bufRef = React.useRef(buf);
  bufRef.current = buf;

  const flushText = React.useCallback(() => {
    const b = bufRef.current;
    const store = useStore.getState();
    const patch = textPatch(b, store.tasks.find((t) => t.id === b.id));
    if (patch) store.updateTask(b.id, patch);
  }, []);

  /*
    Save on the way out.

    The debounce below cancels its timer in the effect cleanup, which is correct
    while you are typing and wrong when the modal closes: type a note, press Esc
    inside 400ms, and the cleanup cancelled the only write that was ever going
    to happen. The note was gone with nothing to say so.

    That was always reachable and is now the main path — the composer's
    Shift+Enter exists precisely so you can open a task, type a note and leave.
    Closing is not cancelling; there is no Cancel in this modal by design.
  */
  React.useEffect(() => () => flushText(), [flushText]);

  // and the same on the way from one task to another, before the buffers reset
  const previousId = React.useRef(buf.id);
  React.useEffect(() => {
    if (previousId.current && previousId.current !== taskId) flushText();
    previousId.current = taskId ?? "";
  }, [taskId, flushText]);

  // debounced writes while typing
  React.useEffect(() => {
    if (!task || buf.id !== task.id) return;
    if (buf.title === task.title || buf.title.trim() === "") return;
    const id = setTimeout(
      () => updateTask(task.id, { title: buf.title.trim() }),
      TEXT_DEBOUNCE,
    );
    return () => clearTimeout(id);
  }, [buf.title]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!task || buf.id !== task.id) return;
    const next = buf.notes.trim() === "" ? null : buf.notes;
    if (next === task.notes) return;
    const id = setTimeout(() => updateTask(task.id, { notes: next }), TEXT_DEBOUNCE);
    return () => clearTimeout(id);
  }, [buf.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
    The label saves as you type too, where it used to save on blur.

    `onBlur` never ran on the path that matters: Esc unmounts the input, and
    removing a focused element does not dispatch `focusout`, so a label typed and
    then escaped was discarded without a word. Debouncing it puts it on the same
    footing as the title and the notes, and the flush above covers the rest.
  */
  React.useEffect(() => {
    if (!task || buf.id !== task.id) return;
    const next = buf.label.trim() === "" ? null : buf.label.trim();
    if (next === task.label) return;
    const id = setTimeout(() => updateTask(task.id, { label: next }), TEXT_DEBOUNCE);
    return () => clearTimeout(id);
  }, [buf.label]); // eslint-disable-line react-hooks/exhaustive-deps

  const creator = members.find((m) => m.id === task?.created_by);

  const allTasks = useStore((s) => s.tasks);
  const knownLabels = React.useMemo(() => labelsInUse(allTasks), [allTasks]);
  const links = React.useMemo(() => extractLinks(buf.notes), [buf.notes]);

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
        aria-describedby={undefined}
        onKeyDown={handleKeyDown}
        /*
          Escape closes the innermost thing, not the outermost.

          With the date grid open, Escape used to close the whole modal: you
          meant to stop picking a date and lost the task you were looking at.
          Radix calls this before it decides to close, and `preventDefault`
          keeps the dialog open — which is the only way to intercept it, since
          the dismissal listener is on the document and a React handler on the
          content cannot stop it from bubbling there.
        */
        onEscapeKeyDown={(e) => {
          if (!picking) return;
          e.preventDefault();
          setPicking(false);
        }}
        /*
          The one shadow in the app.

          `docs/04` bans drop shadows and carves out exactly one exception —
          "the task modal gets a single soft shadow so it reads as floating
          above the page" — and the modal did not have it. The base dialog
          separates itself with a 1px ring, which is the hairline treatment
          every other surface uses, so the one thing meant to read as lifted
          read as another flat panel.

          Wide, soft and offset downward rather than tight and dark: on the
          light theme it is the whole separation, and on the dark one it deepens
          the ground around the panel instead of drawing a second edge next to
          the ring that is already there.
        */
        className="flex max-h-[88dvh] w-[calc(100vw-2rem)] max-w-[540px] flex-col gap-0 overflow-hidden rounded-lg border-border bg-surface p-0 shadow-[0_24px_64px_-16px_rgb(0_0_0/0.55)] sm:max-w-[540px]"
      >
        <DialogTitle className="sr-only">{task.title}</DialogTitle>

        {/* the two text fields are the task; everything below the rule is about it */}
        <div className="shrink-0 border-b border-border px-5 pb-4 pr-12 pt-5">
          <Textarea
            ref={titleRef}
            autoFocus={focus !== "notes"}
            value={buf.title}
            onChange={(e) => setBuf((b) => ({ ...b, title: e.target.value }))}
            placeholder={copy.task.titlePlaceholder}
            rows={1}
            className="min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-[17px] font-medium leading-[1.35] tracking-[-0.014em] text-fg shadow-none focus-visible:ring-0"
          />

          <Textarea
            ref={notesRef}
            autoFocus={focus === "notes"}
            value={buf.notes}
            onChange={(e) => setBuf((b) => ({ ...b, notes: e.target.value }))}
            placeholder={copy.task.notesPlaceholder}
            rows={1}
            className="mt-2 min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 text-[13px] leading-[1.55] text-fg-muted shadow-none focus-visible:ring-0"
          />

          {/*
            A textarea cannot hold a link, so a staging URL or a Figma file
            pasted into notes was text to select and copy by hand every time —
            which in an agency is most of what ends up in there. Not markdown:
            the text is untouched and nothing is parsed, the links are simply
            also listed here, where they can be clicked.
          */}
          {links.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="sr-only">{copy.task.links}</span>
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.href}
                  className="flex max-w-full items-center gap-1 truncate rounded-sm border border-border px-1.5 py-px text-[12px] text-fg-muted hover:border-control hover:text-fg"
                >
                  <LinkIcon className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
                  {link.label}
                </a>
              ))}
            </div>
          )}
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
                    /*
                      Wide enough for a 12-hour clock. A native time input takes
                      its format from the *browser's* locale, not the document's
                      lang — so a browser set to English renders "11:30 PM" in
                      this French app, and at 104px the meridiem was cut to "PI".
                      Nothing can force 24-hour here, so the box fits both.
                    */
                    className="h-7 w-[136px] text-[12px]"
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
                active={assignmentOf(task) === null}
                onClick={() => updateTask(task.id, assign(null))}
              >
                {copy.task.nobody}
              </Chip>
              {members.map((m) => (
                <Chip
                  key={m.id}
                  active={assignmentOf(task) === m.id}
                  onClick={() => updateTask(task.id, assign(m.id))}
                >
                  {/* assignment is chosen here, where there is room for a face */}
                  <Avatar member={m} size="sm" />
                  {m.display_name}
                </Chip>
              ))}
              {/* both of you, offered only where there are two people to be */}
              {members.length > 1 && (
                <Chip
                  active={assignmentOf(task) === BOTH}
                  onClick={() => updateTask(task.id, assign(BOTH))}
                >
                  <span className="flex -space-x-1.5">
                    {members.map((m) => (
                      <Avatar key={m.id} member={m} size="sm" className="ring-1 ring-bg" />
                    ))}
                  </span>
                  {copy.task.shared}
                </Chip>
              )}
            </div>
          </Field>

          {/*
            Only the calendar shows this, and the field says so. A control whose
            effect is invisible from where you are using it is the kind of thing
            somebody sets once, sees nothing, and never touches again.
          */}
          <Field label={copy.task.color}>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => updateTask(task.id, { color: null })}
                aria-pressed={!task.color}
                title={copy.task.colorNone}
                aria-label={copy.task.colorNone}
                className={cn(
                  "grid size-7 place-items-center rounded-sm border",
                  !task.color ? "border-accent" : "border-border",
                )}
              >
                <Slash className="size-3.5 text-fg-faint" strokeWidth={1.5} aria-hidden />
              </button>

              {Object.entries(ACCENTS).map(([key, hex]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateTask(task.id, { color: key })}
                  aria-pressed={task.color === key}
                  title={copy.settings.accentNames[key] ?? key}
                  aria-label={copy.settings.accentNames[key] ?? key}
                  className={cn(
                    "grid size-7 place-items-center rounded-sm border",
                    task.color === key ? "border-accent" : "border-border",
                  )}
                >
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: hex }} />
                </button>
              ))}
            </div>
            <p className="text-[12px] text-fg-faint">{copy.task.colorHint}</p>
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
              aria-label={copy.task.label}
              value={buf.label}
              onChange={(e) => setBuf((b) => ({ ...b, label: e.target.value }))}
              placeholder={copy.task.label}
              className="max-w-[260px]"
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
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                deleteTask(task.id);
                onClose();
              }}
              className="h-8 px-2 text-[13px] text-danger hover:text-danger"
            >
              {copy.task.delete}
            </Button>

            {/*
              Not a back door to recurring tasks, which the brief rules out —
              this makes one copy, once, when you ask. The same checklist for
              the next client is a real thing to want, and retyping six fields
              to get it is the kind of friction that stops people using the app
              for the small things it exists for.
            */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                /*
                  Flush first, then copy what is actually saved. The text fields
                  debounce, so duplicating within 400ms of an edit used to copy
                  the version from before the edit while the original kept the
                  edit — two tasks differing by a change you had just made.
                */
                flushText();
                const from = useStore.getState().tasks.find((t) => t.id === task.id) ?? task;
                createTask({
                  title: from.title,
                  notes: from.notes,
                  label: from.label,
                  important: from.important,
                  due_on: from.due_on,
                  due_time: from.due_time,
                  assignee_id: from.assignee_id,
                  shared: from.shared,
                });
                toast(copy.task.duplicated);
                onClose();
              }}
              className="h-8 rounded-sm px-2 text-[13px] text-fg-muted hover:text-fg"
            >
              {copy.task.duplicate}
            </Button>
          </div>
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
function FieldLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <span id={id} className={MICRO_LABEL}>
      {children}
    </span>
  );
}

/**
 * A labelled field, announced as one.
 *
 * The label was a bare `<span>` sitting above the control and connected to it by
 * nothing — visible to anybody looking at the screen and absent for anybody not.
 * A screen reader reached « Statut » as loose text, then three unnamed buttons.
 *
 * `role="group"` with `aria-labelledby` rather than a `<label>`, because half of
 * these hold a *set* of controls — the status chips, the quick dates, the six
 * accent swatches — and a `<label>` may name exactly one. The single-control
 * fields carry their own `aria-label` as well, so they are named twice over
 * rather than only by the group they sit in.
 */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = React.useId();
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-2">
      <FieldLabel id={id}>{label}</FieldLabel>
      {children}
    </div>
  );
}

