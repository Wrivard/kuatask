"use client";

import * as React from "react";
import { TaskModal } from "@/components/task/task-modal-lazy";
import { ArrowUpRight, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useStore } from "@/lib/store";
import { useTaskModal } from "@/lib/events";
import { useToday } from "@/lib/day";
import { formatDueLabel, instantToDay, now } from "@/lib/time";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

export type Note = { id: string; body: string; created_at: string };

/** How long a note lives. Stated on screen, because it is a promise to keep. */
const KEEPS_FOR_DAYS = 7;

/** Where a pushed note stops being a title and starts being its own notes. */
const TITLE_MAX = 120;

/** Where the draft box stops growing and starts scrolling. About ten lines. */
const DRAFT_MAX_HEIGHT = 260;

/**
 * The dump.
 *
 * Optimistic like everything else here, but deliberately not routed through the
 * store: notes have no undo stack, no realtime, no reconciliation and no
 * cross-view derivation, and `lib/store.ts` is the most load-bearing file in the
 * app. Adding a second entity to it to gain none of what it provides would be
 * paying its cost for nothing.
 *
 * Enter writes the note. Shift+Enter is a newline, because a dump is sometimes a
 * paragraph — and because the alternative, making the fast path the two-key one,
 * would be getting the priority exactly backwards on a page whose entire purpose
 * is not slowing down.
 */
export function NotesClient({
  initial,
  workspaceId,
  userId,
}: {
  initial: Note[];
  workspaceId: string;
  userId: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [notes, setNotes] = React.useState(initial);
  const [draft, setDraft] = React.useState("");
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  /** Inserts still in the air, so a delete can wait for its own row. */
  const inflight = React.useRef(new Map<string, Promise<void>>());

  /*
    Measured rather than counted: wrapping means the number of lines in the
    string is not the number of rows on screen. Reset to auto first, or
    scrollHeight only ever reports back the height we last set.

    Written to the element rather than held in state, because state would
    not survive a keystroke that does not change the height: React sees the
    same number, skips the render, and the "auto" this effect just wrote
    stays — collapsing a five-line draft to two the moment you type in it.
  */
  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const wanted = Math.min(el.scrollHeight, DRAFT_MAX_HEIGHT);
    el.style.height = `${wanted}px`;
    el.style.overflowY = el.scrollHeight > wanted ? "auto" : "hidden";
  }, [draft]);

  const day = useToday();
  const modal = useTaskModal();
  const createTask = useStore((s) => s.createTask);

  function add() {
    const body = draft.trim();
    if (body === "") return;

    const note: Note = {
      id: crypto.randomUUID(),
      body,
      created_at: new Date(now()).toISOString(),
    };

    // on screen before the network, like every other write in this app
    setNotes((n) => [note, ...n]);
    setDraft("");
    inputRef.current?.focus();

    const landed = (async () => {
      const { error } = await supabase
        .from("notes")
        .insert({ id: note.id, workspace_id: workspaceId, user_id: userId, body });
      if (error) setNotes((n) => n.filter((x) => x.id !== note.id));
    })();
    inflight.current.set(note.id, landed);
    void landed.finally(() => inflight.current.delete(note.id));
  }

  function remove(id: string) {
    /*
      Functional, not a snapshot of `notes`: two removes in one frame would
      otherwise have the second one restore what the first took away.
    */
    let before: Note[] = [];
    setNotes((n) => {
      before = n;
      return n.filter((x) => x.id !== id);
    });

    void (async () => {
      /*
        Dump something and discard it in the same breath and the delete used
        to race its own insert: it found no row, reported success, and the
        insert landed after it. The note came back on the next load, having
        been thrown away. Wait for the write that is creating it.
      */
      await inflight.current.get(id);

      const { error } = await supabase.from("notes").delete().eq("id", id);
      if (error) setNotes(before);
    })();
  }

  /*
    The reorganising step: the note becomes a task and stops being a note.

    It opens the same modal the composer's Shift+Enter opens, on a task that
    already exists — `createTask` returns the id it generated on this frame, so
    there is nothing to wait for. The note is removed because a dump you have
    already dealt with is the part that makes the rest hard to read.
  */
  function push(note: Note) {
    /*
      A dump is often several lines, and only the first is a title. The rest
      goes into the task's notes rather than nowhere — dropping it would make
      "dump everything, reorganise later" a lie at exactly the reorganising
      step, and it is the part you were least likely to still remember.
    */
    const [first, ...rest] = note.body.split("\n");
    const body = rest.join("\n").trim();

    const id = createTask({
      title: first.slice(0, TITLE_MAX),
      // the overflow of a very long single line is body too, not lost
      notes: [first.slice(TITLE_MAX).trim(), body].filter(Boolean).join("\n") || null,
    });
    if (!id) return;

    remove(note.id);
    modal.open(id);
  }

  const byDay = React.useMemo(() => {
    const groups = new Map<string, Note[]>();
    for (const note of notes) {
      const d = instantToDay(note.created_at);
      groups.set(d, [...(groups.get(d) ?? []), note]);
    }
    return [...groups.entries()];
  }, [notes]);

  return (
    <div className="max-w-[760px] px-6 py-6">
      {/*
        Two rows to start and it grows from there. A dump that ran to a
        paragraph used to scroll inside a two-line box while you were still
        writing it, which is the one thing this page cannot afford to make
        awkward. The cap keeps a very long one from pushing the list it is
        being added to off the screen.
      */}
      <textarea
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            add();
          }
        }}
        rows={2}
        placeholder={copy.notes.placeholder}
        aria-label={copy.notes.placeholder}
        className={cn(
          "w-full resize-none rounded-sm border border-control bg-bg px-3 py-2",
          "text-[15px] leading-[1.45] text-fg placeholder:text-fg-faint",
          "focus-visible:border-accent focus-visible:outline-none",
        )}
      />

      <p className="mt-1 text-right text-[12px] text-fg-faint">
        {copy.notes.hint}
      </p>

      {notes.length === 0 ? (
        <p className="mt-6 text-[13px] text-fg-muted">{copy.notes.empty}</p>
      ) : (
        <div className="mt-6">
          {byDay.map(([d, group]) => (
            <section key={d} className="mb-6">
              <h2 className="mb-1 text-[13px] font-medium text-fg-muted">
                {d === day ? copy.nav.today : formatDueLabel(d)}
              </h2>

              <ul className="[&>li:last-child]:border-b-0">
                {group.map((note) => (
                  <li
                    key={note.id}
                    className="group flex items-start gap-3 border-b border-border py-2.5"
                  >
                    {/* whitespace-pre-line, so a dump that was a paragraph stays one */}
                    <p className="min-w-0 flex-1 whitespace-pre-line text-[15px] leading-[1.45] text-fg">
                      {note.body}
                    </p>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => push(note)}
                        title={copy.notes.toTask}
                        aria-label={copy.notes.toTask}
                        className={cn(
                          "grid size-7 place-items-center rounded-sm text-fg-faint transition-opacity",
                          "hover:bg-surface-hover hover:text-fg",
                          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                          // no hover under a thumb, so there it simply lives there
                          "[@media(pointer:coarse)]:opacity-100",
                        )}
                      >
                        <ArrowUpRight className="size-4" strokeWidth={1.5} aria-hidden />
                      </button>

                      <button
                        type="button"
                        onClick={() => remove(note.id)}
                        title={copy.notes.discard}
                        aria-label={copy.notes.discard}
                        className={cn(
                          "grid size-7 place-items-center rounded-sm text-fg-faint transition-opacity",
                          "hover:bg-surface-hover hover:text-danger",
                          "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                          "[@media(pointer:coarse)]:opacity-100",
                        )}
                      >
                        <X className="size-4" strokeWidth={1.5} aria-hidden />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="mt-2 text-[12px] text-fg-faint">
        {copy.notes.expiry(KEEPS_FOR_DAYS)}
      </p>

      {modal.openId && (
        <TaskModal taskId={modal.openId} focus={modal.focus} onClose={modal.close} />
      )}
    </div>
  );
}
