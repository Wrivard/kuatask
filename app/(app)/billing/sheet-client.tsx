"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Plus, Trash2, X } from "lucide-react";
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
  parseSheetPaste,
  STATUSES,
  totals,
  type BillingStatus,
} from "@/lib/billing";
import { today } from "@/lib/time";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { ENTRY_COLUMNS, toClient, toEntry, type Client, type Entry } from "./data";

type Filter = "all" | "open" | "paid";

const FILTERS: Filter[] = ["all", "open", "paid"];

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

/** The columns Enter moves down through, in order. The date and status are pickers. */
type Col = "title" | "detail" | "hours" | "rate" | "amount";

/**
 * One client's sheet: Date · Tâche · Détail · Heures · Taux · Montant · Statut.
 *
 * Every cell is edited in place and saved when you leave it, the way the
 * spreadsheet did — no edit mode, no save button. Tab moves right, Enter moves
 * down the column, Shift+Enter up, Escape puts the cell back: the keys both
 * people already have in their fingers from the sheet.
 *
 * Optimistic like the rest of the app, and live: the other person's edits
 * arrive over realtime, except on a row with a write of yours still in flight,
 * where yours is the newer truth.
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
    Rows whose status was changed while a filter would now hide them. Marking a
    row Payé under « À payer » used to make it vanish from under the cursor, so
    you could not see that the click had landed or take it back. They stay until
    the filter changes.
  */
  const [held, setHeld] = React.useState<Set<string>>(new Set());

  /*
    Every write to a row, chained. Two edits to the same row in quick succession
    were two independent requests, and nothing guaranteed they landed in the
    order they were made — the earlier one could arrive last and win. Chaining
    also covers the insert: an edit typed into a row the moment it appears waits
    for the row to exist, rather than updating nothing and reporting success.
  */
  const chain = React.useRef(new Map<string, Promise<unknown>>());
  /** How many writes of ours each row has in the air. Realtime yields to these. */
  const pending = React.useRef(new Map<string, number>());

  const enqueue = React.useCallback((id: string, write: () => Promise<unknown>) => {
    pending.current.set(id, (pending.current.get(id) ?? 0) + 1);
    const next = (chain.current.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(write)
      .finally(() => {
        const n = (pending.current.get(id) ?? 1) - 1;
        if (n <= 0) pending.current.delete(id);
        else pending.current.set(id, n);
        if (chain.current.get(id) === next) chain.current.delete(id);
      });
    chain.current.set(id, next);
    return next;
  }, []);

  /* ------------------------------------------------------------ realtime -- */

  const resync = React.useCallback(async () => {
    const { data, error } = await supabase
      .from("billing_entries")
      .select(ENTRY_COLUMNS)
      .eq("client_id", initialClient.id)
      .order("entry_on", { ascending: false })
      .order("created_at", { ascending: false });
    if (error || !data) return;

    const fresh = (data as Entry[]).map(toEntry);
    setEntries((local) => {
      // our unsaved rows and rows we are writing keep their local version
      const mine = new Map(local.filter((e) => pending.current.has(e.id)).map((e) => [e.id, e]));
      const merged = fresh
        // a row we are deleting is still on the server for a moment; not here
        .filter((e) => !pending.current.has(e.id) || mine.has(e.id))
        .map((e) => mine.get(e.id) ?? e);
      const known = new Set(merged.map((e) => e.id));
      const unsaved = local.filter((e) => mine.has(e.id) && !known.has(e.id));
      return [...unsaved, ...merged];
    });
  }, [supabase, initialClient.id]);

  React.useEffect(() => {
    // the first SUBSCRIBED follows a server render that is already current
    let connectedBefore = false;
    const channel = supabase
      .channel(`billing:${initialClient.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "billing_entries",
          filter: `client_id=eq.${initialClient.id}`,
        },
        (payload) => {
          // by event: a DELETE's `new` is `{}`, not null — see lib/realtime.ts
          const row = toEntry((payload.eventType === "DELETE" ? payload.old : payload.new) as Entry);
          if (!row?.id || pending.current.has(row.id)) return;

          setEntries((list) => {
            if (payload.eventType === "DELETE") return list.filter((e) => e.id !== row.id);
            const at = list.findIndex((e) => e.id === row.id);
            if (at === -1) return [row, ...list];
            const next = list.slice();
            next[at] = row;
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "clients",
          filter: `id=eq.${initialClient.id}`,
        },
        (payload) => {
          if (pending.current.has(initialClient.id)) return;
          setClient(toClient(payload.new as Record<string, unknown>));
        },
      )
      .subscribe((status, err) => {
        // a dropped channel has no replay; whatever it missed comes from a read
        if (status === "SUBSCRIBED") {
          if (connectedBefore) void resync();
          connectedBefore = true;
        }
        if (err) console.warn("[billing] realtime", status, err.message);
      });

    // a tab that was hidden missed whatever happened meanwhile
    const onVisible = () => {
      if (document.visibilityState === "visible") void resync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, initialClient.id, resync]);

  /* ------------------------------------------------------------- derived -- */

  const rate = client.default_rate;
  const shown = entries.filter((e) => SHOWS[filter](e.status) || held.has(e.id));
  const sums = totals(entries, rate);
  const shownSum = shown.reduce((n, e) => n + amountOf(e, rate), 0);
  const shownHours = shown.reduce((n, e) => n + (e.hours ?? 0), 0);

  /* -------------------------------------------------------------- writes -- */

  function patchEntry(id: string, patch: Partial<Entry>) {
    const before = entries.find((e) => e.id === id);
    if (!before) return;

    if (patch.status && !SHOWS[filter](patch.status)) {
      setHeld((h) => new Set(h).add(id));
    }
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

    void enqueue(id, async () => {
      const { error } = await supabase.from("billing_entries").update(patch).eq("id", id);
      if (error) {
        // only the fields this write touched go back; later edits survive
        const undo = Object.fromEntries(
          Object.keys(patch).map((k) => [k, before[k as keyof Entry]]),
        ) as Partial<Entry>;
        setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...undo } : e)));
        toast.error(copy.billing.saveFailed);
      }
    });
  }

  function patchClient(patch: Partial<Client>) {
    const before = client;
    setClient((c) => ({ ...c, ...patch }));

    void enqueue(client.id, async () => {
      const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
      if (error) {
        setClient(before);
        toast.error(copy.billing.saveFailed);
        return;
      }
      // the header title and the switcher read the server copy
      if ("name" in patch || "archived_at" in patch) router.refresh();
    });
  }

  function insert(entry: Entry) {
    // created_at is the server's to stamp
    const row: Partial<Entry> = { ...entry };
    delete row.created_at;
    return enqueue(entry.id, async () => {
      const { error } = await supabase
        .from("billing_entries")
        .insert({ ...(row as Omit<Entry, "created_at">), workspace_id: workspaceId });
      if (error) {
        setEntries((list) => list.filter((e) => e.id !== entry.id));
        toast.error(copy.billing.saveFailed);
      }
    });
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
    void insert(entry);
  }

  /*
    Rows pasted from the spreadsheet. One insert for all of them rather than one
    per row — a tab of forty lines is one request, and it either all lands or
    none of it does, so a failure cannot leave half a client imported. Each row
    still joins its own chain, so an edit made while the import is in the air
    waits for it like any other.
  */
  function importRows(text: string): boolean {
    const parsed = parseSheetPaste(text, today());
    if (!parsed) return false;

    const now = Date.now();
    const rows: Entry[] = parsed.map((r, i) => ({
      ...r,
      id: crypto.randomUUID(),
      client_id: client.id,
      // keeps the pasted order among rows that share a date
      created_at: new Date(now - i).toISOString(),
    }));

    // the sheet runs oldest-first and this page newest-first; imported rows
    // take their place by date rather than landing in a block at the top
    setEntries((list) =>
      [...rows, ...list].sort(
        (a, b) => b.entry_on.localeCompare(a.entry_on) || b.created_at.localeCompare(a.created_at),
      ),
    );
    if (filter !== "all") changeFilter("all");

    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    for (const row of rows) void enqueue(row.id, () => gate);

    void (async () => {
      const { error } = await supabase.from("billing_entries").insert(
        rows.map((row) => {
          const copyRow: Partial<Entry> = { ...row };
          delete copyRow.created_at;
          return { ...(copyRow as Omit<Entry, "created_at">), workspace_id: workspaceId };
        }),
      );
      release();

      if (error) {
        const ids = new Set(rows.map((r) => r.id));
        setEntries((list) => list.filter((e) => !ids.has(e.id)));
        toast.error(copy.billing.saveFailed);
        return;
      }

      toast(copy.billing.imported(rows.length), {
        action: {
          label: copy.toast.undo,
          onClick: () => {
            const ids = rows.map((r) => r.id);
            const gone = new Set(ids);
            setEntries((list) => list.filter((e) => !gone.has(e.id)));
            void (async () => {
              const { error: undoError } = await supabase
                .from("billing_entries")
                .delete()
                .in("id", ids);
              if (undoError) toast.error(copy.billing.saveFailed);
            })();
          },
        },
      });
    })();
    return true;
  }

  /*
    No confirmation dialog: the row goes at once and the toast offers it back.
    Undo re-inserts the same row with the same id, so it returns exactly where
    and as it was.
  */
  function removeRow(entry: Entry) {
    const index = entries.findIndex((e) => e.id === entry.id);
    setEntries((list) => list.filter((e) => e.id !== entry.id));

    void enqueue(entry.id, async () => {
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
            void insert(entry);
          },
        },
      });
    });
  }

  /*
    Only a client with no rows can be deleted — the one made by mistake, or with
    a typo worth starting over from. Anything with history is archived instead,
    which is reversible; a delete here would cascade every row it ever had.
  */
  const deletable = entries.length === 0;

  function removeClient() {
    if (!deletable) return;
    void (async () => {
      await chain.current.get(client.id);
      const { error } = await supabase.from("clients").delete().eq("id", client.id);
      if (error) {
        toast.error(copy.billing.saveFailed);
        return;
      }
      toast(copy.billing.clientDeleted(client.name));
      router.replace("/billing");
      router.refresh();
    })();
  }

  function changeFilter(f: Filter) {
    setFilter(f);
    setHeld(new Set());
  }

  /*
    Enter moves down the column, as in the sheet. Cells are found by row and
    column in the DOM rather than through refs: the rows are the filtered list,
    and it is the list on screen that "the next row" means.
  */
  const tableRef = React.useRef<HTMLTableElement>(null);
  const move = React.useCallback((id: string, col: Col, step: 1 | -1) => {
    const rows = [...(tableRef.current?.querySelectorAll<HTMLElement>("tbody tr[data-row]") ?? [])];
    const at = rows.findIndex((r) => r.dataset.row === id);
    const target = rows[at + step]?.querySelector<HTMLElement>(`[data-col="${col}"]`);
    if (target) target.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  const archived = client.archived_at !== null;
  const others = clients.filter((c) => c.id !== client.id);

  return (
    /*
      Pasting anywhere on the page imports, including into a cell: a multi-cell
      clipboard can only have come from a spreadsheet, and dropping forty rows of
      tabs into one title is never what was meant. A single cell pastes normally.
    */
    <div
      className="px-6 py-6"
      onPaste={(e) => {
        const text = e.clipboardData.getData("text/plain");
        if (!text.includes("\t")) return;
        if (importRows(text)) e.preventDefault();
      }}
    >
      {/* where you are, and the way to the other clients */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link
          href="/billing"
          className="flex h-8 items-center gap-1.5 rounded-sm px-2 text-[13px] text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
          {copy.billing.allClients}
        </Link>

        {others.length > 0 && (
          <select
            value={client.id}
            onChange={(e) => router.push(`/billing/${e.target.value}`)}
            aria-label={copy.billing.switchClient}
            title={copy.billing.switchClient}
            className="h-8 max-w-[240px] rounded-sm border border-control bg-bg px-2 text-[13px] text-fg focus-visible:border-accent focus-visible:outline-none"
          >
            <option value={client.id}>{client.name}</option>
            {others.some((c) => c.archived_at === null) && (
              <optgroup label={copy.billing.active}>
                {others
                  .filter((c) => c.archived_at === null)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            )}
            {others.some((c) => c.archived_at !== null) && (
              <optgroup label={copy.billing.archived}>
                {others
                  .filter((c) => c.archived_at !== null)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
            )}
          </select>
        )}

        {archived && (
          <span className="rounded-sm border border-border px-1.5 py-px text-[12px] text-fg-muted">
            {copy.billing.archivedBadge}
          </span>
        )}

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {/* a typo in a client's name should not need a trip to the database */}
          <div className="h-8 w-full rounded-sm border border-control sm:w-[180px]">
            <TextInput
              value={client.name}
              onCommit={(name) => name && patchClient({ name })}
              label={copy.billing.rename}
              maxLength={120}
            />
          </div>

          <label className="flex h-8 items-center gap-1.5 text-[13px] text-fg-muted">
            {copy.billing.rate}
            <span className="inline-block w-16 rounded-sm border border-control">
              <NumberInput
                value={client.default_rate}
                onCommit={(n) => {
                  // a client always has a rate; clearing the box keeps the old one
                  if (n !== null) patchClient({ default_rate: n });
                }}
                label={copy.billing.rate}
                keepOnEmpty
              />
            </span>
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

          {deletable && (
            <button
              type="button"
              onClick={removeClient}
              title={copy.billing.deleteClient}
              aria-label={copy.billing.deleteClient}
              className="grid size-8 place-items-center rounded-sm border border-border text-fg-faint hover:border-danger hover:text-danger"
            >
              <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <dl className="mb-5 grid grid-cols-2 gap-x-8 gap-y-3 sm:flex sm:flex-wrap">
        {STATUSES.map((s) => (
          <div key={s}>
            <dt className={MICRO_LABEL}>{copy.billing.status[s]}</dt>
            <dd
              className="mt-0.5 font-mono text-[18px] tabular-nums text-fg-muted"
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
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => changeFilter(f)}>
            {copy.billing.filter[f]}
            <span className="font-mono tabular-nums text-fg-faint">
              {entries.filter((e) => SHOWS[f](e.status)).length}
            </span>
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
        <table ref={tableRef} className="w-full min-w-[900px] border-collapse text-[14px]">
          <colgroup>
            <col className="w-[140px]" />
            <col className="w-[22%]" />
            <col />
            <col className="w-[76px]" />
            <col className="w-[88px]" />
            <col className="w-[124px]" />
            <col className="w-[120px]" />
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
                <td colSpan={8} className="px-3 py-8 text-center text-[13px] text-fg-muted">
                  {entries.length === 0 ? copy.billing.firstRow : copy.billing.emptyRows}
                </td>
              </tr>
            )}

            {shown.map((e) => (
              <tr
                key={e.id}
                data-row={e.id}
                className={cn(
                  "group align-top hover:bg-surface-hover/50",
                  // a paid row is history: still there, one step quieter
                  e.status === "paid" && "text-fg-muted",
                )}
              >
                <Td>
                  <DateInput
                    value={e.entry_on}
                    onCommit={(entry_on) => patchEntry(e.id, { entry_on })}
                    label={copy.billing.col.date}
                  />
                </Td>
                <Td>
                  <TextInput
                    value={e.title}
                    autoFocus={focusId === e.id}
                    onCommit={(title) => patchEntry(e.id, { title })}
                    onMove={(step) => move(e.id, "title", step)}
                    col="title"
                    label={copy.billing.col.title}
                    placeholder={copy.billing.titlePlaceholder}
                    maxLength={200}
                    strong
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
                    onMove={(step) => move(e.id, "hours", step)}
                    col="hours"
                    label={copy.billing.col.hours}
                  />
                </Td>
                <Td>
                  <NumberInput
                    value={e.rate}
                    // only worth showing once there are hours for it to multiply
                    placeholder={e.hours !== null ? formatNumber(rate) : undefined}
                    onCommit={(r) => patchEntry(e.id, { rate: r })}
                    onMove={(step) => move(e.id, "rate", step)}
                    col="rate"
                    label={copy.billing.col.rate}
                  />
                </Td>
                <Td>
                  <NumberInput
                    value={e.amount}
                    // what it will be if left alone, shown in the empty cell
                    placeholder={
                      isComputed(e) && e.hours !== null
                        ? formatNumber(amountOf(e, rate))
                        : undefined
                    }
                    title={isComputed(e) ? copy.billing.computed : copy.billing.fixed}
                    onCommit={(amount) => patchEntry(e.id, { amount })}
                    onMove={(step) => move(e.id, "amount", step)}
                    col="amount"
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
                      // under a finger it is always there, and a target rather than a speck
                      "[@media(pointer:coarse)]:size-9 [@media(pointer:coarse)]:opacity-100",
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

      <p className="mt-3 text-[12px] text-fg-faint">{copy.billing.keysHint}</p>
    </div>
  );
}

function insertAt<T>(list: T[], item: T, index: number): T[] {
  const i = index < 0 ? 0 : Math.min(index, list.length);
  return [...list.slice(0, i), item, ...list.slice(i)];
}

/** Borderless, so the table's rules are the grid and the input is just the text. */
const CELL = cn(
  "w-full rounded-sm bg-transparent px-2 py-1 text-[14px] text-inherit",
  "placeholder:text-fg-faint focus-visible:bg-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
);

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={cn(
        MICRO_LABEL,
        "border-b border-r border-border px-3 py-2 font-medium",
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
  "I did not mean that" — and the flag stops the blur that Escape causes from
  committing the very draft it just threw away.
*/
function useDraft(value: string) {
  const [draft, setDraft] = React.useState(value);
  const editing = React.useRef(false);
  const cancelled = React.useRef(false);
  React.useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  return { draft, setDraft, editing, cancelled };
}

/** Enter commits and moves down, Shift+Enter up, Escape reverts. */
function sheetKeys(
  e: React.KeyboardEvent<HTMLInputElement>,
  revert: () => void,
  onMove?: (step: 1 | -1) => void,
) {
  if (e.key === "Enter") {
    e.preventDefault();
    if (onMove) onMove(e.shiftKey ? -1 : 1);
    else e.currentTarget.blur();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    revert();
    e.currentTarget.blur();
  }
}

function TextInput({
  value,
  onCommit,
  onMove,
  col,
  label,
  placeholder,
  maxLength,
  autoFocus,
  strong = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  onMove?: (step: 1 | -1) => void;
  col?: Col;
  label: string;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  strong?: boolean;
}) {
  const { draft, setDraft, editing, cancelled } = useDraft(value);

  return (
    <input
      value={draft}
      autoFocus={autoFocus}
      maxLength={maxLength}
      aria-label={label}
      placeholder={placeholder}
      data-col={col}
      onFocus={() => {
        editing.current = true;
        cancelled.current = false;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        if (cancelled.current) return;
        const next = draft.trim();
        if (next !== draft) setDraft(next);
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) =>
        sheetKeys(
          e,
          () => {
            cancelled.current = true;
            setDraft(value);
          },
          onMove,
        )
      }
      className={cn(CELL, "h-full", strong && "font-medium")}
    />
  );
}

/**
 * The date, as the browser's own picker. Committed on leaving rather than on
 * every change: typing a year into a date field passes through 0002, 0020 and
 * 0202 on its way to 2026, and each of those is a valid date that was being
 * saved.
 */
function DateInput({
  value,
  onCommit,
  label,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
}) {
  const { draft, setDraft, editing, cancelled } = useDraft(value);

  const commit = (next: string) => {
    // an emptied or half-typed date is not a date; the old one stays
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || next < "2000-01-01") {
      setDraft(value);
      return;
    }
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="date"
      value={draft}
      aria-label={label}
      onFocus={() => {
        editing.current = true;
        cancelled.current = false;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        if (!cancelled.current) commit(draft);
      }}
      onKeyDown={(e) =>
        sheetKeys(e, () => {
          cancelled.current = true;
          setDraft(value);
        })
      }
      className={cn(CELL, "tabular-nums")}
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
  const { draft, setDraft, editing, cancelled } = useDraft(value);
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
      data-col="detail"
      onFocus={() => {
        editing.current = true;
        cancelled.current = false;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        if (cancelled.current) return;
        const next = draft.replace(/\s+$/, "");
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
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
  onMove,
  col,
  label,
  placeholder,
  title,
  strong = false,
  keepOnEmpty = false,
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  onMove?: (step: 1 | -1) => void;
  col?: Col;
  label: string;
  placeholder?: string;
  title?: string;
  strong?: boolean;
  /** For a value that cannot be blank: clearing the box puts it back. */
  keepOnEmpty?: boolean;
}) {
  const { draft, setDraft, editing, cancelled } = useDraft(formatNumber(value));

  const commit = () => {
    const parsed = parseAmount(draft);
    if (parsed === undefined) {
      toast.error(copy.billing.invalidNumber);
      setDraft(formatNumber(value));
      return;
    }
    if (parsed === null && keepOnEmpty) {
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
      data-col={col}
      onFocus={(e) => {
        editing.current = true;
        cancelled.current = false;
        // replacing a number is what you usually came to do, as in the sheet
        e.currentTarget.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        if (!cancelled.current) commit();
      }}
      onKeyDown={(e) =>
        sheetKeys(
          e,
          () => {
            cancelled.current = true;
            setDraft(formatNumber(value));
          },
          onMove,
        )
      }
      className={cn(
        CELL,
        "text-right font-mono text-[13px] tabular-nums",
        // a typed price is ink; a computed one prints as the placeholder, a step lighter
        strong && "font-medium placeholder:font-normal placeholder:text-fg-muted",
      )}
    />
  );
}
