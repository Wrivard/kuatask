"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/chip";
import { ACCENTS } from "@/components/task/assignee-dot";
import {
  amountOf,
  formatMoney,
  formatNumber,
  isComputed,
  parseAmount,
  STATUSES,
  totals,
  type BillingStatus,
} from "@/lib/billing";
import { today } from "@/lib/time";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { Client, Entry } from "./data";

type Filter = "all" | "open" | "paid";

const SHOWS: Record<Filter, (s: BillingStatus) => boolean> = {
  all: () => true,
  open: (s) => s !== "paid",
  paid: (s) => s === "paid",
};

/*
  Colour per status, from the six the app already has rather than new ones:
  paid is the accent (done, like a completed task), invoiced is amber (waiting
  on somebody else), and à facturer is plain — it is the default state of work,
  not a warning.
*/
const STATUS_COLOR: Record<BillingStatus, string | undefined> = {
  pending: undefined,
  invoiced: ACCENTS.amber,
  paid: "var(--color-accent)",
};

/**
 * One client's sheet: Date · Tâche · Détail · Heures · Taux · Montant · Statut.
 *
 * Every cell is edited in place and saved when you leave it, the way the
 * spreadsheet did — there is no edit mode and no save button, because the sheet
 * never had one and both people are used to typing straight into the grid.
 *
 * Optimistic like the rest of the app. A write that fails puts the old value
 * back and says so; nothing waits on the network before it shows.
 */
export function ClientSheet({
  client: initialClient,
  clients,
  initial,
  workspaceId,
}: {
  client: Client;
  clients: Client[];
  initial: Entry[];
  workspaceId: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [client, setClient] = React.useState(initialClient);
  const [entries, setEntries] = React.useState(initial);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [focusId, setFocusId] = React.useState<string | null>(null);

  /*
    Inserts still in the air. An edit typed into a row the moment it appears
    would otherwise reach the database before the row does, update nothing, and
    report success — the same race the Braindump had. Writes to a row wait for
    the insert that is creating it.
  */
  const inflight = React.useRef(new Map<string, Promise<unknown>>());

  const rate = client.default_rate;
  const shown = entries.filter((e) => SHOWS[filter](e.status));
  const sums = totals(entries, rate);
  const shownSum = shown.reduce((n, e) => n + amountOf(e, rate), 0);
  const shownHours = shown.reduce((n, e) => n + (e.hours ?? 0), 0);

  function patchEntry(id: string, patch: Partial<Entry>) {
    let before: Entry | undefined;
    setEntries((list) =>
      list.map((e) => {
        if (e.id !== id) return e;
        before = e;
        return { ...e, ...patch };
      }),
    );

    void (async () => {
      await inflight.current.get(id);
      const { error } = await supabase.from("billing_entries").update(patch).eq("id", id);
      if (error && before) {
        const old = before;
        setEntries((list) => list.map((e) => (e.id === id ? old : e)));
        toast.error(copy.billing.saveFailed);
      }
    })();
  }

  function patchClient(patch: Partial<Client>) {
    const before = client;
    setClient((c) => ({ ...c, ...patch }));

    void (async () => {
      const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
      if (error) {
        setClient(before);
        toast.error(copy.billing.saveFailed);
        return;
      }
      // the title in the header and the dashboard both read the server copy
      router.refresh();
    })();
  }

  function insert(entry: Entry) {
    // created_at is the server's to stamp
    const row: Partial<Entry> = { ...entry };
    delete row.created_at;
    const landed = (async () => {
      const { error } = await supabase
        .from("billing_entries")
        .insert({ ...(row as Omit<Entry, "created_at">), workspace_id: workspaceId });
      if (error) {
        setEntries((list) => list.filter((e) => e.id !== entry.id));
        toast.error(copy.billing.saveFailed);
      }
    })();
    inflight.current.set(entry.id, landed);
    void landed.finally(() => inflight.current.delete(entry.id));
  }

  function addRow() {
    const entry: Entry = {
      id: crypto.randomUUID(),
      client_id: client.id,
      entry_on: today(),
      title: "",
      detail: "",
      hours: null,
      rate: null,
      amount: null,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    // at the top, where the newest rows are, and visible whatever the filter
    setEntries((list) => [entry, ...list]);
    if (filter === "paid") setFilter("all");
    setFocusId(entry.id);
    insert(entry);
  }

  /*
    No confirmation dialog: the row goes at once and the toast offers it back.
    Undo re-inserts the same row with the same id, so it returns exactly where
    and as it was.
  */
  function removeRow(entry: Entry) {
    const index = entries.findIndex((e) => e.id === entry.id);
    setEntries((list) => list.filter((e) => e.id !== entry.id));

    void (async () => {
      await inflight.current.get(entry.id);
      const { error } = await supabase.from("billing_entries").delete().eq("id", entry.id);
      if (error) {
        setEntries((list) => insertAt(list, entry, index));
        toast.error(copy.billing.saveFailed);
        return;
      }
      toast(copy.billing.rowDeleted, {
        action: {
          label: copy.toast.undo,
          onClick: () => {
            setEntries((list) => insertAt(list, entry, index));
            insert(entry);
          },
        },
      });
    })();
  }

  const archived = client.archived_at !== null;

  return (
    <div className="px-6 py-6">
      {/* where you are, and the way to the other clients */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/billing"
          className="flex h-8 items-center gap-1.5 rounded-sm px-2 text-[13px] text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
          {copy.billing.allClients}
        </Link>

        <select
          value={client.id}
          onChange={(e) => router.push(`/billing/${e.target.value}`)}
          aria-label={copy.billing.switchClient}
          className="h-8 max-w-[240px] rounded-sm border border-control bg-bg px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
        >
          <optgroup label={copy.billing.active}>
            {clients
              .filter((c) => c.archived_at === null || c.id === client.id)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </optgroup>
          {clients.some((c) => c.archived_at !== null && c.id !== client.id) && (
            <optgroup label={copy.billing.archived}>
              {clients
                .filter((c) => c.archived_at !== null && c.id !== client.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* a typo in a client's name should not need a trip to the database */}
          <div className="w-[180px] rounded-sm border border-control">
            <TextInput
              value={client.name}
              onCommit={(name) => name && patchClient({ name })}
              label={copy.billing.rename}
              maxLength={120}
            />
          </div>

          <label className="flex h-8 items-center gap-1.5 text-[13px] text-fg-muted">
            {copy.billing.rate}
            <NumberInput
              value={client.default_rate}
              onCommit={(n) => n !== null && patchClient({ default_rate: n })}
              className="h-8 w-16 rounded-sm border border-control px-2 text-right"
              label={copy.billing.rate}
            />
            {copy.billing.rateSuffix}
          </label>

          <button
            type="button"
            onClick={() => patchClient({ archived_at: archived ? null : new Date().toISOString() })}
            className="flex h-8 items-center gap-1.5 rounded-sm border border-border px-2.5 text-[13px] text-fg-muted hover:border-control hover:text-fg"
          >
            {archived ? (
              <ArchiveRestore className="size-4" strokeWidth={1.5} aria-hidden />
            ) : (
              <Archive className="size-4" strokeWidth={1.5} aria-hidden />
            )}
            {archived ? copy.billing.unarchive : copy.billing.archive}
          </button>
        </div>
      </div>

      <dl className="mb-5 flex flex-wrap gap-x-8 gap-y-2">
        {STATUSES.map((s) => (
          <div key={s}>
            <dt className={MICRO_LABEL}>{copy.billing.status[s]}</dt>
            <dd
              className="mt-0.5 font-mono text-[18px] tabular-nums"
              style={{ color: sums[s] > 0 ? STATUS_COLOR[s] : undefined }}
            >
              {formatMoney(sums[s])}
            </dd>
          </div>
        ))}
        <div>
          <dt className={MICRO_LABEL} title={copy.billing.outstandingHint}>
            {copy.billing.outstanding}
          </dt>
          <dd className="mt-0.5 font-mono text-[18px] font-medium tabular-nums text-fg">
            {formatMoney(sums.outstanding)}
          </dd>
        </div>
      </dl>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {(["all", "open", "paid"] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
            {copy.billing.filter[f]}
          </Chip>
        ))}

        <button
          type="button"
          onClick={addRow}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-[13px] font-medium text-bg hover:opacity-90"
        >
          <Plus className="size-4" strokeWidth={2} aria-hidden />
          {copy.billing.addRow}
        </button>
      </div>

      {/*
        A real table, drawn like a sheet: every cell ruled, every cell an input.
        Wider than a phone on purpose — seven columns of money do not reflow into
        something readable — so it scrolls sideways there instead of the page.
      */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[900px] border-collapse text-[14px]">
          <colgroup>
            <col className="w-[132px]" />
            <col className="w-[22%]" />
            <col />
            <col className="w-[76px]" />
            <col className="w-[88px]" />
            <col className="w-[120px]" />
            <col className="w-[116px]" />
            <col className="w-[36px]" />
          </colgroup>
          <thead className="bg-surface">
            <tr>
              <Th>{copy.billing.col.date}</Th>
              <Th>{copy.billing.col.title}</Th>
              <Th>{copy.billing.col.detail}</Th>
              <Th right>{copy.billing.col.hours}</Th>
              <Th right>{copy.billing.col.rate}</Th>
              <Th right>{copy.billing.col.amount}</Th>
              <Th>{copy.billing.col.status}</Th>
              <th className="border-b border-border" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-[13px] text-fg-muted">
                  {copy.billing.emptyRows}
                </td>
              </tr>
            )}

            {shown.map((e) => (
              <tr key={e.id} className="group align-top hover:bg-surface-hover/50">
                <Td>
                  <input
                    type="date"
                    value={e.entry_on}
                    onChange={(ev) => ev.target.value && patchEntry(e.id, { entry_on: ev.target.value })}
                    aria-label={copy.billing.col.date}
                    className={CELL}
                  />
                </Td>
                <Td>
                  <TextInput
                    value={e.title}
                    autoFocus={focusId === e.id}
                    onCommit={(title) => patchEntry(e.id, { title })}
                    label={copy.billing.col.title}
                    maxLength={200}
                  />
                </Td>
                <Td>
                  <DetailInput
                    value={e.detail}
                    onCommit={(detail) => patchEntry(e.id, { detail })}
                    label={copy.billing.col.detail}
                  />
                </Td>
                <Td>
                  <NumberInput
                    value={e.hours}
                    onCommit={(hours) => patchEntry(e.id, { hours })}
                    label={copy.billing.col.hours}
                  />
                </Td>
                <Td>
                  <NumberInput
                    value={e.rate}
                    placeholder={formatNumber(rate)}
                    onCommit={(r) => patchEntry(e.id, { rate: r })}
                    label={copy.billing.col.rate}
                  />
                </Td>
                <Td>
                  <NumberInput
                    value={e.amount}
                    // what it will be if left alone, shown in the empty cell
                    placeholder={isComputed(e) ? formatNumber(amountOf(e, rate)) : undefined}
                    title={isComputed(e) ? copy.billing.computed : copy.billing.fixed}
                    onCommit={(amount) => patchEntry(e.id, { amount })}
                    label={copy.billing.col.amount}
                    strong
                  />
                </Td>
                <Td>
                  <select
                    value={e.status}
                    onChange={(ev) => patchEntry(e.id, { status: ev.target.value as BillingStatus })}
                    aria-label={copy.billing.col.status}
                    className={cn(CELL, "cursor-pointer font-medium")}
                    style={{ color: STATUS_COLOR[e.status] }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {copy.billing.status[s]}
                      </option>
                    ))}
                  </select>
                </Td>
                <td className="border-b border-border px-1 py-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(e)}
                    title={copy.billing.deleteRow}
                    aria-label={copy.billing.deleteRow}
                    className={cn(
                      "grid size-6 place-items-center rounded-sm text-fg-faint",
                      "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger",
                      "[@media(pointer:coarse)]:opacity-100",
                    )}
                  >
                    <X className="size-4" strokeWidth={1.5} aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          {shown.length > 0 && (
            <tfoot className="bg-surface">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-[12px] text-fg-faint">
                  {copy.billing.shown(shown.length)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-[13px] tabular-nums text-fg-muted">
                  {shownHours > 0 ? formatNumber(shownHours) : ""}
                </td>
                <td />
                <td className="px-3 py-2 text-right font-mono text-[13px] font-medium tabular-nums text-fg">
                  {formatMoney(shownSum)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function insertAt<T>(list: T[], item: T, index: number): T[] {
  const i = index < 0 ? 0 : Math.min(index, list.length);
  return [...list.slice(0, i), item, ...list.slice(i)];
}

/** Borderless, so the table's rules are the grid and the input is just the text. */
const CELL = cn(
  "w-full rounded-sm bg-transparent px-2 py-1 text-[14px] text-fg",
  "placeholder:text-fg-faint focus-visible:bg-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
);

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={cn(
        MICRO_LABEL,
        "border-b border-r border-border px-3 py-2 font-medium last:border-r-0",
        right ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-r border-border px-1 py-1">{children}</td>;
}

/*
  A draft that follows the saved value until you start typing, and is committed
  when you leave. Escape puts the saved value back, which is the spreadsheet's
  "I did not mean that".
*/
function useDraft(value: string) {
  const [draft, setDraft] = React.useState(value);
  const editing = React.useRef(false);
  React.useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  return { draft, setDraft, editing };
}

function TextInput({
  value,
  onCommit,
  label,
  maxLength,
  autoFocus,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const { draft, setDraft, editing } = useDraft(value);

  const commit = () => {
    editing.current = false;
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  return (
    <input
      value={draft}
      autoFocus={autoFocus}
      maxLength={maxLength}
      aria-label={label}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          editing.current = false;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(CELL, "font-medium")}
    />
  );
}

/**
 * The detail column, which in the sheet is a short list of lines
 * (« -Design et programmation / -Site Web Mobile »). Enter is a new line here,
 * as it is in a cell being edited; leaving the cell saves.
 */
function DetailInput({
  value,
  onCommit,
  label,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
}) {
  const { draft, setDraft, editing } = useDraft(value);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // grows with its lines, written to the element so a keystroke that leaves
  // the height unchanged cannot collapse it — see the Braindump draft box
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={1}
      maxLength={4000}
      aria-label={label}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        const next = draft.replace(/\s+$/, "");
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          editing.current = false;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(CELL, "block resize-none overflow-hidden text-[13px] leading-[1.45] text-fg-muted")}
    />
  );
}

function NumberInput({
  value,
  onCommit,
  label,
  placeholder,
  title,
  strong = false,
  className,
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  label: string;
  placeholder?: string;
  title?: string;
  strong?: boolean;
  className?: string;
}) {
  const { draft, setDraft, editing } = useDraft(formatNumber(value));

  const commit = () => {
    editing.current = false;
    const parsed = parseAmount(draft);
    if (parsed === undefined) {
      toast.error(copy.billing.invalidNumber);
      setDraft(formatNumber(value));
      return;
    }
    setDraft(formatNumber(parsed));
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      value={draft}
      inputMode="decimal"
      aria-label={label}
      title={title}
      placeholder={placeholder}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          editing.current = false;
          setDraft(formatNumber(value));
          e.currentTarget.blur();
        }
      }}
      className={cn(
        CELL,
        "text-right font-mono text-[13px] tabular-nums",
        // a typed price is ink; a computed one prints as the placeholder, a step lighter
        strong && "font-medium text-fg placeholder:font-normal placeholder:text-fg-muted",
        className,
      )}
    />
  );
}
