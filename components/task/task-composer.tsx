"use client";

import * as React from "react";
import { RotateCcw, X } from "lucide-react";
import { parseFr } from "@/lib/parse-fr";
import { composeTask } from "@/lib/compose";
import { formatDueLabel, formatTime } from "@/lib/time";
import { useStore } from "@/lib/store";
import { useFocusComposer } from "@/lib/events";
import { useDraft } from "@/lib/draft";
import {
  applySuggestion,
  suggestionsFor,
  tokenAtCursor,
  type Suggestion,
} from "@/lib/suggest";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Persistent single-line capture. Enter creates and instantly clears, keeping
 * focus — rapid-fire capture without leaving the keyboard is the whole point.
 *
 * Parsed tokens are stripped from the title and shown as dismissible chips, so
 * a task genuinely called "Appeler Marie demain matin" is fixable in one click.
 * French only: a bilingual parser produces more false positives than it saves.
 */
export function TaskComposer({
  defaultDueOn = null,
  defaultAssigneeId = null,
  search,
}: {
  defaultDueOn?: string | null;
  defaultAssigneeId?: string | null;
  /**
   * When present the composer is a search box instead of a capture box.
   *
   * One field with two modes rather than two fields: the composer already owns
   * the top of the list and the keyboard focus, and a separate search input
   * would compete with it for both.
   */
  search?: {
    active: boolean;
    query: string;
    onQuery: (value: string) => void;
    onExit: () => void;
  };
}) {
  // survives a glance at the calendar; see lib/draft.ts
  const [value, setValue] = useDraft("composer:" + (defaultDueOn ?? "main"));
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const inputRef = React.useRef<HTMLInputElement>(null);

  const createTask = useStore((s) => s.createTask);
  const members = useStore((s) => s.members);

  const parsed = React.useMemo(() => parseFr(value), [value]);

  /*
    Everything a submit would produce, derived rather than computed inside the
    handler — the preview under the box has to show exactly what Enter is about
    to make, and there is only one place that can be decided.
  */
  const composed = React.useMemo(
    () =>
      composeTask({
        value,
        dismissed,
        members,
        defaultDueOn,
        defaultAssigneeId,
      }),
    [value, dismissed, members, defaultDueOn, defaultAssigneeId],
  );

  // --- #label and @person autocomplete -------------------------------------
  const [cursor, setCursor] = React.useState(0);
  const [activeSuggestion, setActiveSuggestion] = React.useState(0);
  const tasks = useStore((s) => s.tasks);

  const token = React.useMemo(() => tokenAtCursor(value, cursor), [value, cursor]);
  const suggestions = React.useMemo(
    () => (token ? suggestionsFor(token, tasks, members) : []),
    [token, tasks, members],
  );

  React.useEffect(() => setActiveSuggestion(0), [token?.kind, token?.query]);

  function choose(choice: Suggestion) {
    if (!token) return;
    const next = applySuggestion(value, cursor, token, choice);
    setValue(next.value);
    setDismissed(new Set());
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(next.cursor, next.cursor);
      setCursor(next.cursor);
    });
  }

  // C and the palette focus the composer; / switches it to search first
  useFocusComposer(() => inputRef.current?.focus());

  const searching = search?.active ?? false;
  const finalTitle = composed.title;

  function submit() {
    if (!composed.title) return;

    // matched is for the chips; the store has no use for it
    createTask({
      title: composed.title,
      due_on: composed.due_on,
      due_time: composed.due_time,
      label: composed.label,
      important: composed.important,
      assignee_id: composed.assignee_id,
    });

    // clear on the same frame — never await the write
    setValue("");
    setCursor(0);
    setDismissed(new Set());
    inputRef.current?.focus();
  }

  /*
    Every token the parser found gets a chip, switched on or off.

    Dismissing one used to remove it, which made the decision one-way: get it
    wrong and the only way back was to delete the word and type it again. An off
    chip stays where it was, struck through, and clicking it turns the reading
    back on.
  */
  const matched = new Set(parsed.matched.map((m) => m.kind));
  const chips = (
    [
      matched.has("date") && parsed.dueOn
        ? { kind: "date", text: formatDueLabel(parsed.dueOn) }
        : null,
      matched.has("time") && parsed.dueTime
        ? { kind: "time", text: formatTime(parsed.dueTime) }
        : null,
      matched.has("label") && parsed.label
        ? { kind: "label", text: "#" + parsed.label }
        : null,
      matched.has("assignee") && parsed.assigneeHandle
        ? { kind: "assignee", text: "@" + parsed.assigneeHandle }
        : null,
      parsed.important ? { kind: "important", text: copy.task.important } : null,
    ].filter(Boolean) as { kind: string; text: string }[]
  ).map((chip) => ({ ...chip, on: !dismissed.has(chip.kind) }));

  const toggleChip = (kind: string) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });

  return (
    <div className="mb-4">
      <input
        ref={inputRef}
        type="text"
        value={searching ? search!.query : value}
        onChange={(e) => {
          if (searching) {
            search!.onQuery(e.target.value);
            return;
          }
          setValue(e.target.value);
          setCursor(e.target.selectionStart ?? e.target.value.length);
          setDismissed(new Set());
        }}
        onKeyDown={(e) => {
          if (searching) {
            // Escape is the only way out, and it clears as it goes
            if (e.key === "Escape") {
              e.preventDefault();
              search!.onExit();
            }
            // Enter would otherwise create a task named after the query
            if (e.key === "Enter") e.preventDefault();
            return;
          }

          /*
            Suggestions borrow Enter only while they are open. Everywhere else
            Enter still creates the task — capture speed is the point, and a
            picker that swallows Enter would cost more than it saves.
          */
          if (suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveSuggestion((i) => (i + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveSuggestion((i) => (i - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === "Tab" || e.key === "Enter") {
              e.preventDefault();
              choose(suggestions[activeSuggestion]);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setCursor(-1); // closes the list without touching the text
              return;
            }
          }

          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
        onClick={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
        placeholder={searching ? copy.composer.searchPlaceholder : copy.composer.placeholder}
        aria-label={searching ? copy.composer.searchPlaceholder : copy.composer.placeholder}
        className={cn(
          "h-10 w-full rounded-sm border border-control bg-surface px-3",
          "text-[15px] leading-[1.4] tracking-[-0.011em]",
          "placeholder:text-fg-faint focus:border-accent focus:outline-none",
          searching && "border-accent",
        )}
      />

      {/*
        Only while typing, so an idle list stays quiet — and only where a
        keyboard exists. docs/07-keyboard.md: no keyboard hints on touch, decided
        by a pointer media query rather than by sniffing the user agent.
      */}
      {!searching && suggestions.length === 0 && value.trim() !== "" && (
        <p className="mt-1 hidden text-right text-[12px] text-fg-faint [@media(pointer:fine)]:block">
          {copy.composer.hint}
        </p>
      )}

      {!searching && suggestions.length > 0 && (
        <ul className="mt-1 overflow-hidden rounded-sm border border-border bg-surface">
          {suggestions.map((suggestion, i) => (
            <li key={suggestion.value}>
              <button
                type="button"
                // mousedown, not click: the input must not lose focus first
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(suggestion);
                }}
                onMouseEnter={() => setActiveSuggestion(i)}
                className={cn(
                  "flex w-full items-center px-3 py-1.5 text-left text-[13px]",
                  i === activeSuggestion ? "bg-surface-hover text-fg" : "text-fg-muted",
                )}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!searching && chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/*
            What the title will be, shown before what was taken out of it. Words
            vanishing from the line you are typing is alarming when nothing says
            where they went, and until a chip appeared nothing did.
          */}
          <span className="mr-0.5 max-w-full truncate text-[12px] text-fg">
            {finalTitle || copy.composer.emptyTitle}
          </span>

          {chips.map((chip) => (
            <button
              key={chip.kind}
              type="button"
              onClick={() => toggleChip(chip.kind)}
              aria-pressed={chip.on}
              title={chip.on ? copy.composer.chipOff : copy.composer.chipOn}
              className={cn(
                "flex items-center gap-1 rounded-sm border px-1.5 py-px text-[12px]",
                chip.on
                  ? "border-control text-fg-muted hover:text-fg"
                  : "border-border text-fg-faint line-through hover:text-fg-muted",
              )}
            >
              {chip.text}
              {chip.on ? (
                <X className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
              ) : (
                <RotateCcw className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
