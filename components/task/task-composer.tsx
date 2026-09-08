"use client";

import * as React from "react";
import { X } from "lucide-react";
import { parseFr } from "@/lib/parse-fr";
import { formatDueLabel, formatTime } from "@/lib/time";
import { useStore } from "@/lib/store";
import { useFocusComposer } from "@/lib/events";
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
}: {
  defaultDueOn?: string | null;
  defaultAssigneeId?: string | null;
}) {
  const [value, setValue] = React.useState("");
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const inputRef = React.useRef<HTMLInputElement>(null);

  const createTask = useStore((s) => s.createTask);
  const members = useStore((s) => s.members);

  const parsed = React.useMemo(() => parseFr(value), [value]);

  // C, / and the palette all focus the composer through this
  useFocusComposer(() => inputRef.current?.focus());

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
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setDismissed(new Set());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={copy.composer.placeholder}
        aria-label={copy.composer.placeholder}
        className={cn(
          "h-10 w-full rounded-sm border border-border bg-surface px-3",
          "text-[15px] leading-[1.4] tracking-[-0.011em]",
          "placeholder:text-fg-faint focus:border-border-strong focus:outline-none",
        )}
      />

      {chips.length > 0 && (
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
