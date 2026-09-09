"use client";

import * as React from "react";
import { X } from "lucide-react";
import { parseFr } from "@/lib/parse-fr";
import { formatDueLabel, formatTime } from "@/lib/time";
import { useStore } from "@/lib/store";
import { useFocusComposer } from "@/lib/events";
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
  const [value, setValue] = React.useState("");
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const inputRef = React.useRef<HTMLInputElement>(null);

  const createTask = useStore((s) => s.createTask);
  const members = useStore((s) => s.members);

  const parsed = React.useMemo(() => parseFr(value), [value]);

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

  // a dismissed chip means "you got that wrong" — honour it until the text changes
  const active = React.useMemo(() => {
    const kinds = new Set(parsed.matched.map((m) => m.kind));
    return {
      date: kinds.has("date") && !dismissed.has("date") ? parsed.dueOn : null,
      time: kinds.has("time") && !dismissed.has("time") ? parsed.dueTime : null,
      label: kinds.has("label") && !dismissed.has("label") ? parsed.label : null,
      assignee:
        kinds.has("assignee") && !dismissed.has("assignee")
          ? parsed.assigneeHandle
          : null,
      important: parsed.important && !dismissed.has("important"),
    };
  }, [parsed, dismissed]);

  const resolvedAssignee = React.useMemo(() => {
    if (!active.assignee) return null;
    const handle = active.assignee.toLowerCase();
    return (
      members.find((m) => m.display_name.toLowerCase().startsWith(handle))?.id ??
      null
    );
  }, [active.assignee, members]);

  function submit() {
    /*
      Dismissing a date or time chip means the parser was wrong and the words
      belong to the title — "Appeler Marie demain matin" must not silently lose
      "demain". They are re-appended rather than slotted back in place; word
      order suffers slightly, losing the word does not. #label, @handle and !
      are notation, not prose, so they stay stripped.
    */
    const restored = parsed.matched
      .filter((m) => dismissed.has(m.kind) && (m.kind === "date" || m.kind === "time"))
      .map((m) => m.text);

    const title = [parsed.title.trim(), ...restored].join(" ").trim();
    if (!title) return;

    createTask({
      title,
      due_on: active.date ?? defaultDueOn,
      due_time: active.time,
      label: active.label,
      important: active.important,
      assignee_id: resolvedAssignee ?? defaultAssigneeId,
    });

    // clear on the same frame — never await the write
    setValue("");
    setCursor(0);
    setDismissed(new Set());
    inputRef.current?.focus();
  }

  const chips: { kind: string; text: string }[] = [
    active.date && { kind: "date", text: formatDueLabel(active.date) },
    active.time && { kind: "time", text: formatTime(active.time) },
    active.label && { kind: "label", text: `#${active.label}` },
    active.assignee && { kind: "assignee", text: `@${active.assignee}` },
    active.important && { kind: "important", text: copy.task.important },
  ].filter(Boolean) as { kind: string; text: string }[];

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
          {chips.map((chip) => (
            <button
              key={chip.kind}
              type="button"
              onClick={() =>
                setDismissed((prev) => new Set(prev).add(chip.kind))
              }
              className="flex items-center gap-1 rounded-sm border border-border px-1.5 py-px text-[12px] text-fg-muted hover:text-fg"
            >
              {chip.text}
              <X className="size-3" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
