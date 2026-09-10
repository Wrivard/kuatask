"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useStore } from "@/lib/store";
import { parseFr } from "@/lib/parse-fr";
import { bucketOf } from "@/lib/time";
import { copy } from "@/lib/copy";

const BUCKET_LABEL: Record<string, string> = {
  today: copy.nav.today,
  tomorrow: copy.nav.tomorrow,
  week: copy.nav.week,
  month: copy.nav.month,
  later: copy.nav.later,
  undated: copy.nav.undated,
};

/**
 * One cmdk dialog, five groups, fuzzy-matched over the in-memory store — so
 * results appear as you type with no debounce and no loading state. This is
 * also the app's only search.
 */
export function CommandPalette({
  open,
  onOpenChange,
  onOpenTask,
  onFocusComposer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenTask: (id: string) => void;
  onFocusComposer: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");

  const tasks = useStore((s) => s.tasks);
  const members = useStore((s) => s.members);
  const me = useStore((s) => s.me);
  const filter = useStore((s) => s.assigneeFilter);
  const setFilter = useStore((s) => s.setAssigneeFilter);
  const createTask = useStore((s) => s.createTask);
  const setSound = useStore((s) => s.setSoundEnabled);

  const open_ = React.useCallback(
    (fn: () => void) => {
      fn();
      onOpenChange(false);
      setQuery("");
    },
    [onOpenChange],
  );

  const todo = React.useMemo(
    () => tasks.filter((t) => t.status !== "done").slice(0, 200),
    [tasks],
  );

  const exactMatch = todo.some(
    (t) => t.title.toLowerCase() === query.trim().toLowerCase(),
  );

  const partner = members.find((m) => m.id !== me?.id);
  const soundOn = me?.sound_enabled ?? true;

  function setTheme(next: "light" | "dark") {
    const root = document.documentElement;
    root.classList.toggle("light", next === "light");
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("kua-theme", next);
    } catch {
      // blocked storage — the theme just will not persist
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={copy.palette.placeholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{copy.palette.empty}</CommandEmpty>

        <CommandGroup heading={copy.palette.groupTasks}>
          {todo.map((task) => {
            const assignee = members.find((m) => m.id === task.assignee_id);
            return (
              <CommandItem
                key={task.id}
                value={`${task.title} ${task.label ?? ""}`}
                /*
                  The row shows the title, then its bucket and whose it is, in
                  two spans with no separator between them — read aloud that
                  becomes "envoyer la facture Demain Guillaume". The label says
                  it as a sentence; `value` stays what it was, since that is
                  what cmdk matches typing against.
                */
                aria-label={[
                  task.title,
                  BUCKET_LABEL[bucketOf(task.due_on)],
                  assignee?.display_name,
                ]
                  .filter(Boolean)
                  .join(" — ")}
                onSelect={() => open_(() => onOpenTask(task.id))}
              >
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                <span className="shrink-0 text-[12px] text-fg-faint">
                  {BUCKET_LABEL[bucketOf(task.due_on)]}
                  {assignee ? ` · ${assignee.display_name}` : ""}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>

        <CommandGroup heading={copy.palette.groupCreate}>
          <CommandItem value="nouvelle tache" onSelect={() => open_(onFocusComposer)}>
            {copy.palette.newTask}
          </CommandItem>
          {query.trim() !== "" && !exactMatch && (
            <CommandItem
              value={`creer ${query}`}
              onSelect={() =>
                open_(() => {
                  // same French parsing the composer uses
                  const parsed = parseFr(query);
                  const handle = parsed.assigneeHandle?.toLowerCase();
                  createTask({
                    title: parsed.title,
                    due_on: parsed.dueOn,
                    due_time: parsed.dueTime,
                    label: parsed.label,
                    important: parsed.important,
                    assignee_id: handle
                      ? (members.find((m) =>
                          m.display_name.toLowerCase().startsWith(handle),
                        )?.id ?? null)
                      : null,
                  });
                })
              }
            >
              {copy.palette.createNamed(query)}
            </CommandItem>
          )}
        </CommandGroup>

        <CommandGroup heading={copy.palette.groupGo}>
          <CommandItem value="liste aujourdhui" onSelect={() => open_(() => router.push("/"))}>
            {copy.nav.list}
          </CommandItem>
          <CommandItem value="tableau board kanban" onSelect={() => open_(() => router.push("/board"))}>
            {copy.nav.board}
          </CommandItem>
          <CommandItem value="calendrier" onSelect={() => open_(() => router.push("/calendar"))}>
            {copy.nav.calendar}
          </CommandItem>
          <CommandItem value="reglages profil" onSelect={() => open_(() => router.push("/settings"))}>
            {copy.nav.settings}
          </CommandItem>
          <CommandItem value="personnes membres invitations" onSelect={() => open_(() => router.push("/settings/people"))}>
            {copy.people.title}
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading={copy.palette.groupFilter}>
          <CommandItem value="filtre tout" onSelect={() => open_(() => setFilter(null))}>
            {copy.filter.all}
            {filter === null && <span className="ml-auto text-fg-faint">•</span>}
          </CommandItem>
          {me && (
            <CommandItem value="filtre moi" onSelect={() => open_(() => setFilter(me.id))}>
              {copy.filter.mine}
              {filter === me.id && <span className="ml-auto text-fg-faint">•</span>}
            </CommandItem>
          )}
          {partner && (
            <CommandItem
              value={`filtre ${partner.display_name}`}
              onSelect={() => open_(() => setFilter(partner.id))}
            >
              {partner.display_name}
              {filter === partner.id && <span className="ml-auto text-fg-faint">•</span>}
            </CommandItem>
          )}
        </CommandGroup>

        <CommandGroup heading={copy.palette.groupSettings}>
          <CommandItem value="theme sombre" onSelect={() => open_(() => setTheme("dark"))}>
            {copy.settings.themeDark}
          </CommandItem>
          <CommandItem value="theme clair" onSelect={() => open_(() => setTheme("light"))}>
            {copy.settings.themeLight}
          </CommandItem>
          <CommandItem value="son" onSelect={() => open_(() => setSound(!soundOn))}>
            {soundOn ? copy.settings.soundOff : copy.settings.soundOn}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
