"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Copy, Plus, Settings2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { ACCENTS } from "@/components/task/assignee-dot";
import {
  amountOf,
  formatAmount,
  formatMoney,
  formatNumber,
  invoiceText,
  isComputed,
  parseAmount,
  parseSheetPaste,
  taxesOn,
  formatRate,
  GST_RATE,
  QST_RATE,
  STATUSES,
  totals,
  type BillingStatus,
} from "@/lib/billing";
import { formatLedgerDate, today } from "@/lib/time";
import { paidTone, tick } from "@/lib/sound";
import { MICRO_LABEL } from "@/lib/type";
import { normalize } from "@/lib/search";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { ENTRY_COLUMNS, toClient, toEntry, type Client, type Entry, type Product } from "./data";
import { ClientSettings } from "./client-settings";
import { PRIMARY, SECONDARY } from "./ui";

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
const STATUS_COLOR: Record<BillingStatus, string> = {
  pending: "var(--color-fg-muted)",
  invoiced: ACCENTS.amber,
  paid: "var(--color-accent)",
};

/** The status as a tinted wash, the way the calendar tints a task: colour without shouting. */
const statusWash = (s: BillingStatus) =>
  `color-mix(in srgb, ${STATUS_COLOR[s]} ${s === "pending" ? 10 : 14}%, transparent)`;

/** Not a product: the picker's last row, which opens the price list. */
const MANAGE_PRODUCTS = "__manage__";

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
  products,
  workspaceId,
}: {
  client: Client;
  clients: Client[];
  initial: Entry[];
  /** The price list, for adding a line without retyping it. */
  products: Product[];
  workspaceId: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [client, setClient] = React.useState(initialClient);
  const [entries, setEntries] = React.useState(initial);
  const [filter, setFilter] = React.useState<Filter>("all");
  const [focusId, setFocusId] = React.useState<string | null>(null);
  /*
    Name, rate, archive and delete are set once per client and then left alone,
    so they live behind one button. They sat in the toolbar at full size, which
    put the client's name on screen three times — title, switcher, rename box —
    and made the first thing you read on every sheet a row of form fields.
  */
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  /*
    « +2 500,00 $ » beside Payé for a moment when money moves there. The tile
    total changing is correct and easy to miss; the gain, said once, is the
    part worth noticing.
  */
  const [gain, setGain] = React.useState<{ amount: number; key: number } | null>(null);
  React.useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), 2400);
    return () => clearTimeout(t);
  }, [gain]);

  function celebrate(amount: number) {
    if (amount <= 0) return;
    paidTone();
    tick();
    setGain({ amount, key: Date.now() });
  }

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

  /*
    Tell the server side of the app that this client's numbers moved.

    Marking a line Payé here changed nothing on the dashboard until the page
    was reloaded: the totals are computed on the server, and Next keeps the
    last render of /billing in its router cache, so going back showed the
    figures from before the change. router.refresh() re-reads this page and
    drops that cache, so the list is right when you get to it — and the other
    person's screen hears about it over realtime anyway.

    Debounced: ticking four lines in a row is one re-read, not four.
  */
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touchServer = React.useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 700);
  }, [router]);
  React.useEffect(() => () => clearTimeout(refreshTimer.current), []);

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
          event: "*",
          schema: "public",
          table: "billing_products",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        // the picker is served by the page; a new price list means a new render
        () => touchServer(),
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
  }, [supabase, initialClient.id, resync, workspaceId, touchServer]);

  /* ------------------------------------------------------------- derived -- */

  const rate = client.default_rate;
  const shown = entries.filter((e) => SHOWS[filter](e.status) || held.has(e.id));
  const sums = totals(entries, rate);
  const shownSum = shown.reduce((n, e) => n + amountOf(e, rate), 0);
  const shownHours = shown.reduce((n, e) => n + (e.hours ?? 0), 0);
  // on what the filter is showing, so « À payer » gives the taxes of the invoice
  const shownTax = taxesOn(shownSum);

  /* -------------------------------------------------------------- writes -- */

  function patchEntry(id: string, patch: Partial<Entry>) {
    const before = entries.find((e) => e.id === id);
    if (!before) return;

    if (patch.status && !SHOWS[filter](patch.status)) {
      setHeld((h) => new Set(h).add(id));
    }
    if (patch.status === "paid" && before.status !== "paid") celebrate(amountOf(before, rate));
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

    void enqueue(id, async () => {
      const { error } = await supabase.from("billing_entries").update(patch).eq("id", id);
      if (!error) touchServer();
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

  /** Resolves true once the server has it, so the settings can say « Enregistré ». */
  function patchClient(patch: Partial<Client>): Promise<boolean> {
    const before = client;
    setClient((c) => ({ ...c, ...patch }));

    return enqueue(client.id, async () => {
      const { error } = await supabase.from("clients").update(patch).eq("id", client.id);
      if (error) {
        setClient(before);
        toast.error(copy.billing.saveFailed);
        return false;
      }
      // the header title and the switcher read the server copy
      if ("name" in patch || "archived_at" in patch) router.refresh();
      return true;
    }) as Promise<boolean>;
  }

  function insert(entry: Entry) {
    // created_at and updated_at are the server's to stamp
    const row: Partial<Entry> = { ...entry };
    delete row.created_at;
    delete row.updated_at;
    return enqueue(entry.id, async () => {
      const { error } = await supabase
        .from("billing_entries")
        .insert({ ...(row as Omit<Entry, "created_at">), workspace_id: workspaceId });
      if (!error) touchServer();
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
      // the server stamps both; this is the optimistic stand-in
      updated_at: new Date().toISOString(),
    };
    // at the top, where the newest rows are, and visible whatever the filter
    setEntries((list) => [entry, ...list]);
    if (filter === "paid") setFilter("all");
    setFocusId(entry.id);
    void insert(entry);
  }

  /*
    A line from the price list: the product's name, detail and price, copied
    in. Copied, not linked — the line is what was agreed that day, so a price
    change next month does not rewrite an invoice already sent.
  */
  function addFromProduct(product: Product) {
    const entry: Entry = {
      id: crypto.randomUUID(),
      client_id: client.id,
      entry_on: today(),
      title: product.name,
      detail: product.detail,
      hours: null,
      rate: null,
      amount: product.price,
      status: "pending",
      created_at: new Date().toISOString(),
      // the server stamps both; this is the optimistic stand-in
      updated_at: new Date().toISOString(),
    };
    setEntries((list) => [entry, ...list]);
    if (filter === "paid") changeFilter("all");
    void insert(entry);
    toast(copy.billing.lineAdded(product.name));
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
      updated_at: new Date(now - i).toISOString(),
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
          delete copyRow.updated_at;
          return { ...(copyRow as Omit<Entry, "created_at">), workspace_id: workspaceId };
        }),
      );
      release();
      if (!error) touchServer();

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
              else touchServer();
            })();
          },
        },
      });
    })();
    return true;
  }

  /*
    Every row in one status, moved to the next: « Tout facturer » once the
    invoice is sent, « Tout marquer payé » once it is paid. One pastille at a
    time was a click per line for what is, in practice, one event.

    One request for all of them, after any write already in flight on those
    rows, and each row's chain waits for it — the same discipline as a single
    edit. The toast says what moved and offers it back.
  */
  function bulkStatus(from: BillingStatus, to: BillingStatus) {
    const moved = entries.filter((e) => e.status === from);
    if (moved.length === 0) return;
    const ids = moved.map((e) => e.id);
    const idSet = new Set(ids);
    const sum = moved.reduce((n, e) => n + amountOf(e, rate), 0);

    if (!SHOWS[filter](to)) setHeld((h) => new Set([...h, ...ids]));
    setEntries((list) => list.map((e) => (idSet.has(e.id) ? { ...e, status: to } : e)));
    if (to === "paid") celebrate(sum);

    const prior = Promise.all(ids.map((id) => chain.current.get(id)?.catch(() => {})));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    for (const id of ids) void enqueue(id, () => gate);

    const put = (status: BillingStatus) =>
      supabase.from("billing_entries").update({ status }).in("id", ids);

    void (async () => {
      await prior;
      const { error } = await put(to);
      release();
      if (!error) touchServer();

      if (error) {
        setEntries((list) => list.map((e) => (idSet.has(e.id) ? { ...e, status: from } : e)));
        toast.error(copy.billing.saveFailed);
        return;
      }

      toast(copy.billing.bulkMoved(moved.length, copy.billing.status[to], formatMoney(sum)), {
        action: {
          label: copy.toast.undo,
          onClick: () => {
            setEntries((list) => list.map((e) => (idSet.has(e.id) ? { ...e, status: from } : e)));
            void put(from).then(({ error: undoError }) => {
              if (undoError) toast.error(copy.billing.saveFailed);
              else touchServer();
            });
          },
        },
      });
    })();
  }

  /*
    The invoice is written in QuickBooks; what this saves is retyping it. Every
    line still to invoice, its detail and the total, as text to paste.
  */
  async function copyForInvoice() {
    const pending = entries.filter((e) => e.status === "pending");
    if (pending.length === 0) return;
    const text = invoiceText(client.name, pending, rate, copy.billing.invoiceHeading, {
      subtotal: copy.billing.subtotal,
      gst: copy.billing.gst,
      qst: copy.billing.qst,
      total: copy.billing.totalWithTaxes,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast(copy.billing.copied(pending.length));
    } catch {
      toast.error(copy.billing.copyFailed);
    }
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
      if (!error) touchServer();
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
  // this client as it is now (its status may have just changed), among the rest, by name
  const switcher = [...others, client].sort((a, b) => a.name.localeCompare(b.name, "fr"));

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
            {/*
              Every client in its own group, this one included. It used to be
              listed on its own above the groups, which read as though it
              belonged to neither — an active client that looked set apart.
            */}
            {(
              [
                [copy.billing.active, switcher.filter((c) => c.archived_at === null)],
                [copy.billing.archived, switcher.filter((c) => c.archived_at !== null)],
              ] as const
            ).map(
              ([label, group]) =>
                group.length > 0 && (
                  <optgroup key={label} label={label}>
                    {group.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                ),
            )}
          </select>
        )}

        {/* always shown, active included: the absence of « Archivé » said nothing */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={copy.billing.statusLabel}
          className="flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium"
          style={{
            color: archived ? "var(--color-fg-muted)" : "var(--color-accent)",
            backgroundColor: archived
              ? "color-mix(in srgb, var(--color-fg-muted) 12%, transparent)"
              : "color-mix(in srgb, var(--color-accent) 14%, transparent)",
          }}
        >
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: "currentColor" }}
          />
          {archived ? copy.billing.clientStatus.archived : copy.billing.clientStatus.active}
        </button>

        <button
          type="button"
          onClick={() => setSettingsOpen((o) => !o)}
          aria-expanded={settingsOpen}
          className={cn(
            "ml-auto flex h-8 items-center gap-1.5 rounded-sm px-2.5 text-[13px] text-fg-muted hover:bg-surface-hover hover:text-fg",
            settingsOpen && "bg-surface-hover text-fg",
          )}
        >
          <Settings2 className="size-4" strokeWidth={1.5} aria-hidden />
          {copy.billing.settings}
          <span className="tabular-nums text-fg-faint">
            · {formatNumber(client.default_rate)} {copy.billing.rateSuffix}
          </span>
        </button>
      </div>

      {settingsOpen && (
        <ClientSettings
          client={client}
          clients={clients}
          archived={archived}
          deletable={deletable}
          onPatch={patchClient}
          onDelete={removeClient}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/*
        A client with nothing on it yet. Three tiles reading 0,00 $, filters
        counting 0 and a ruled table with one line of small print in it was the
        first thing you saw after creating a client — the page's whole apparatus,
        describing nothing. One panel instead, with the two ways to start.
      */}
      {entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-control px-6 py-10 text-center">
          <p className="text-[15px] font-medium text-fg">{copy.billing.emptyTitle(client.name)}</p>
          <p className="mx-auto mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-fg-muted">
            {copy.billing.emptyBody}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={addRow} className={PRIMARY}>
              <Plus className="size-4" strokeWidth={2} aria-hidden />
              {copy.billing.addRow}
            </button>
            {!settingsOpen && (
              <button type="button" onClick={() => setSettingsOpen(true)} className={SECONDARY}>
                {copy.billing.rateLine(formatNumber(client.default_rate))}
              </button>
            )}
          </div>
        </div>
      ) : (
      <>
      {/*
        The same three tiles as the dashboard, so the two pages read as one
        place. « À recevoir » is not a fourth: it is the footer of the « À payer »
        filter, where it is a sum of rows you can see.
      */}
      {/*
        Each tile carries the action that moves its money on: what is still to
        invoice can be copied for the invoice and marked invoiced; what is
        invoiced can be marked paid. The actions sit beside the sums they
        change, so the page reads as the work left to do.
      */}
      <dl className="mb-6 grid grid-cols-3 gap-2">
        {STATUSES.map((st) => (
          <div
            key={st}
            className="flex min-w-0 flex-col rounded-md border border-border px-3 py-2.5 sm:px-4 sm:py-3"
          >
            <dt className={cn(MICRO_LABEL, "flex items-center gap-1.5")}>
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[st] }}
              />
              {copy.billing.status[st]}
              {st === "paid" && gain && (
                <span
                  key={gain.key}
                  aria-live="polite"
                  className="ml-auto animate-[billing-gain_2.4s_ease-out_forwards] rounded-full motion-reduce:animate-none bg-accent px-1.5 py-px text-[11px] normal-case tracking-normal text-bg tabular-nums"
                >
                  +{formatMoney(gain.amount)}
                </span>
              )}
            </dt>
            <dd
              className={cn(
                "mt-1 text-[15px] font-medium tabular-nums tracking-[-0.01em] transition-colors sm:text-[20px]",
                sums[st] > 0 ? "text-fg" : "text-fg-faint",
              )}
            >
              {formatMoney(sums[st])}
            </dd>

            {st === "pending" && sums.pending > 0 && (
              <dd className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <TileAction onClick={copyForInvoice} icon={Copy}>
                  <Label short={copy.billing.copyShort} full={copy.billing.copyForInvoice} />
                </TileAction>
                <TileAction onClick={() => bulkStatus("pending", "invoiced")} icon={ArrowRight} strong>
                  <Label short={copy.billing.markAllInvoicedShort} full={copy.billing.markAllInvoiced} />
                </TileAction>
              </dd>
            )}
            {st === "invoiced" && sums.invoiced > 0 && (
              <dd className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                <TileAction onClick={() => bulkStatus("invoiced", "paid")} icon={ArrowRight} strong>
                  <Label short={copy.billing.markAllPaidShort} full={copy.billing.markAllPaid} />
                </TileAction>
              </dd>
            )}
          </div>
        ))}
      </dl>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <Chip key={f} active={filter === f} onClick={() => changeFilter(f)}>
            {copy.billing.filter[f]}
            <span className="tabular-nums text-fg-faint">
              {entries.filter((e) => SHOWS[f](e.status)).length}
            </span>
          </Chip>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {products.length > 0 && (
            <Select
              value=""
              onValueChange={(id) => {
                // the last entry is the way to the price list itself
                if (id === MANAGE_PRODUCTS) {
                  router.push("/billing/produits");
                  return;
                }
                const product = products.find((p) => p.id === id);
                if (product) addFromProduct(product);
              }}
            >
              <SelectTrigger
                aria-label={copy.billing.fromProduct}
                className={cn(SECONDARY, "px-3")}
              >
                {copy.billing.fromProduct}
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    <span className="flex w-full items-center justify-between gap-6">
                      {product.name}
                      <span className="tabular-nums text-fg-muted">
                        {formatMoney(product.price)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
                <span className="my-1 block h-px bg-border" />
                <SelectItem value={MANAGE_PRODUCTS}>
                  <span className="text-fg-muted">{copy.billing.manageProducts}</span>
                </SelectItem>
              </SelectContent>
            </Select>
          )}

          <button type="button" onClick={addRow} className={PRIMARY}>
            <Plus className="size-4" strokeWidth={2} aria-hidden />
            {copy.billing.addRow}
          </button>
        </div>
      </div>

      {/*
        On a phone, Détail, Heures and Taux step aside so Montant and Statut — what
        you open a client on a phone to check — are on screen without scrolling
        sideways. Both stay editable on a wider screen.

        A real table, drawn like a sheet: every cell ruled, every cell an input.
        Wider than a phone on purpose — seven columns of money do not reflow into
        something readable — so it scrolls sideways there instead of the page.
      */}
      <div className="overflow-x-auto rounded-md border border-border bg-bg">
        <table ref={tableRef} className="w-full min-w-[480px] sm:min-w-[900px] border-collapse text-[14px] [&_tbody_tr:last-child_td]:border-b-0">
          <thead className="bg-surface">
            <tr>
              <Th className="w-[92px] sm:w-[128px]">{copy.billing.col.date}</Th>
              <Th className="w-[22%]">{copy.billing.col.title}</Th>
              <Th className="hidden sm:table-cell">{copy.billing.col.detail}</Th>
              <Th right className="w-[76px] hidden sm:table-cell">{copy.billing.col.hours}</Th>
              <Th right className="w-[88px] hidden sm:table-cell">{copy.billing.col.rate}</Th>
              <Th right className="w-[96px] sm:w-[124px]">{copy.billing.col.amount}</Th>
              <Th className="w-[112px] sm:w-[120px]">{copy.billing.col.status}</Th>
              <th className="w-[36px] border-b border-border" aria-hidden />
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
                  <TitleCell
                    products={products}
                    onPick={(product) =>
                      patchEntry(e.id, {
                        title: product.name,
                        detail: product.detail || e.detail,
                        amount: product.price,
                      })
                    }
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
                <Td className="hidden sm:table-cell">
                  <DetailInput
                    value={e.detail}
                    onCommit={(detail) => patchEntry(e.id, { detail })}
                    label={copy.billing.col.detail}
                  />
                </Td>
                <Td className="hidden sm:table-cell">
                  <NumberInput
                    value={e.hours}
                    onCommit={(hours) => patchEntry(e.id, { hours })}
                    onMove={(step) => move(e.id, "hours", step)}
                    col="hours"
                    label={copy.billing.col.hours}
                  />
                </Td>
                <Td className="hidden sm:table-cell">
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
                        ? formatAmount(amountOf(e, rate))
                        : undefined
                    }
                    title={isComputed(e) ? copy.billing.computed : copy.billing.fixed}
                    format={formatAmount}
                    onCommit={(amount) => patchEntry(e.id, { amount })}
                    onMove={(step) => move(e.id, "amount", step)}
                    col="amount"
                    label={copy.billing.col.amount}
                    strong
                  />
                </Td>
                <Td>
                  <StatusPill
                    value={e.status}
                    onChange={(status) => patchEntry(e.id, { status })}
                  />
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
                <td colSpan={2} className="px-3 py-2 text-[12px] text-fg-faint">
                  {copy.billing.shown(shown.length)}
                </td>
                <td className="hidden sm:table-cell" />
                <td className="hidden px-3 py-2 text-right text-[13px] tabular-nums text-fg-muted sm:table-cell">
                  {shownHours > 0 ? formatNumber(shownHours) : ""}
                </td>
                <td className="hidden sm:table-cell" />
                <td className="px-3 py-2 text-right text-[13px] font-medium tabular-nums text-fg">
                  {formatMoney(shownSum)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/*
        What the invoice says, under what the app counts. Every amount above is
        before tax and stays that way — tax collected is the government's money
        passing through, and counting it as revenue would overstate the year by
        about fifteen per cent. This block is the arithmetic you would otherwise
        do on a calculator before typing the invoice.
      */}
      <dl className="mt-4 ml-auto w-full max-w-[320px] text-[13px]">
        <TaxLine label={copy.billing.subtotal} value={formatMoney(shownTax.subtotal)} />
        <TaxLine label={`${copy.billing.gst} ${formatRate(GST_RATE)}`} value={formatMoney(shownTax.gst)} muted />
        <TaxLine label={`${copy.billing.qst} ${formatRate(QST_RATE)}`} value={formatMoney(shownTax.qst)} muted />
        <TaxLine label={copy.billing.totalWithTaxes} value={formatMoney(shownTax.total)} strong />
      </dl>
      <p className="mt-2 text-right text-[12px] text-fg-faint">{copy.billing.taxesNote}</p>

      <p className="mt-3 text-[12px] text-fg-faint">{copy.billing.keysHint}</p>
      </>
      )}
    </div>
  );
}

/**
 * The row's status, as a tinted pill that opens the app's own menu.
 *
 * It was a native <select>: the browser drew the open list on its own sheet,
 * and the trigger's colour carried into the options — « À facturer » in pale
 * grey on the platform's near-white menu, unreadable on the dark theme until
 * you hovered it. The menu is the app's surface now, in both themes.
 */
function StatusPill({
  value,
  onChange,
}: {
  value: BillingStatus;
  onChange: (next: BillingStatus) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as BillingStatus)}>
      <SelectTrigger
        aria-label={copy.billing.col.status}
        className="h-7 w-full px-2.5 font-medium"
        style={{ color: STATUS_COLOR[value], backgroundColor: statusWash(value) }}
      >
        {copy.billing.status[value]}
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((st) => (
          <SelectItem key={st} value={st}>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: STATUS_COLOR[st] }}
              />
              {copy.billing.status[st]}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One line of the tax block: label left, amount right, total in ink. */
function TaxLine({
  label,
  value,
  muted = false,
  strong = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-6 py-1",
        strong && "mt-1 border-t border-border pt-2 font-medium text-fg",
        muted && "text-fg-muted",
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** A tile is a third of a phone; its actions say the short thing there. */
function Label({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{full}</span>
    </>
  );
}

/** A quiet text action inside a tile; the strong one is the step forward. */
function TileAction({
  onClick,
  icon: Icon,
  strong = false,
  children,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 whitespace-nowrap rounded-sm text-left text-[12px] font-medium underline-offset-2 hover:underline",
        strong ? "text-accent" : "text-fg-muted hover:text-fg",
      )}
    >
      {Icon === ArrowRight ? null : <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />}
      {children}
      {Icon === ArrowRight && <Icon className="size-3.5" strokeWidth={2} aria-hidden />}
    </button>
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

function Th({
  children,
  right = false,
  className,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        MICRO_LABEL,
        "whitespace-nowrap border-b border-border px-3 py-2.5 font-medium",
        right ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  // rows are ruled, columns are not: a line between every cell is what made
  // this read as a form to fill in rather than a list of work
  return <td className={cn("border-b border-border px-1 py-1.5", className)}>{children}</td>;
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
  onDone,
  onType,
  onNavigate,
  inputRef,
}: {
  value: string;
  onCommit: (v: string) => void;
  /** Called once the field has been left, after committing. */
  onDone?: () => void;
  /** Every keystroke, for a caller showing suggestions under the field. */
  onType?: (value: string) => void;
  /** Arrow keys and Enter, for that caller. True means it handled the key. */
  onNavigate?: (key: string) => boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
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
      ref={inputRef}
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
      onChange={(e) => {
        setDraft(e.target.value);
        onType?.(e.target.value);
      }}
      onBlur={() => {
        editing.current = false;
        if (!cancelled.current) {
          const next = draft.trim();
          if (next !== draft) setDraft(next);
          if (next !== value) onCommit(next);
        }
        onDone?.();
      }}
      onKeyDown={(e) => {
        // the suggestion list gets the arrows and Enter first, when it is open
        if (onNavigate?.(e.key)) {
          e.preventDefault();
          return;
        }
        sheetKeys(
          e,
          () => {
            cancelled.current = true;
            setDraft(value);
          },
          onMove,
        );
      }}
      className={cn(CELL, "h-full", strong && "font-medium")}
    />
  );
}

/**
 * The title: read as text, edited as a field — and the field suggests the
 * price list as you type.
 *
 * An input never wraps, so on a narrow screen every title was cut to its first
 * fifteen characters. Shown as text it wraps to three lines, and turns into the
 * field on click or on focus, which is also where Tab and Enter land.
 *
 * Typing is typing: the suggestions are an offer, never a requirement, and a
 * line whose name is not in the price list is written the way it always was.
 * Picking one fills the name, the detail and the price in a single write.
 */
function TitleCell({
  products = [],
  onPick,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  products?: Product[];
  onPick?: (product: Product) => void;
}) {
  const [open, setOpen] = React.useState(Boolean(props.autoFocus));

  if (!open) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={props.label}
        data-col={props.col}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        className={cn(
          CELL,
          "min-h-7 cursor-text [overflow-wrap:anywhere]",
          props.strong && "font-medium",
          !props.value && "text-fg-faint",
        )}
      >
        <span className="line-clamp-3">{props.value || props.placeholder}</span>
      </div>
    );
  }

  return (
    <TitleField
      {...props}
      products={products}
      onPick={onPick}
      onDone={() => setOpen(false)}
    />
  );
}

/** The field itself, with the suggestion list under it. */
function TitleField({
  products,
  onPick,
  onDone,
  ...props
}: React.ComponentProps<typeof TextInput> & {
  products: Product[];
  onPick?: (product: Product) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [typed, setTyped] = React.useState(props.value);
  const [at, setAt] = React.useState(0);
  const picking = React.useRef(false);

  const query = normalize(typed.trim());
  const matches = products
    .filter((product) => (query === "" ? true : normalize(product.name).includes(query)))
    .slice(0, 6);
  const list = onPick && matches.length > 0 ? matches : [];

  const pick = (product: Product) => {
    picking.current = true;
    onPick?.(product);
    onDone?.();
  };

  return (
    <span className="relative block">
      <TextInput
        {...props}
        inputRef={ref}
        onType={setTyped}
        onDone={() => {
          // the click that picked already wrote the row; do not write the draft over it
          if (!picking.current) onDone?.();
        }}
        onNavigate={(key) => {
          if (list.length === 0) return false;
          if (key === "ArrowDown") {
            setAt((i) => (i + 1) % list.length);
            return true;
          }
          if (key === "ArrowUp") {
            setAt((i) => (i - 1 + list.length) % list.length);
            return true;
          }
          if (key === "Enter" && at < list.length) {
            pick(list[at]);
            return true;
          }
          return false;
        }}
      />

      {list.length > 0 && (
        <span className="absolute left-0 top-full z-40 mt-1 block min-w-[240px] rounded-md border border-border bg-surface p-1 shadow-lg">
          <span className={cn(MICRO_LABEL, "block px-2 py-1")}>{copy.billing.tabProducts}</span>
          {list.map((product, i) => (
            <button
              key={product.id}
              type="button"
              // mousedown, not click: blur would close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                pick(product);
              }}
              onMouseEnter={() => setAt(i)}
              className={cn(
                "flex w-full items-center justify-between gap-4 rounded-sm px-2 py-1.5 text-left text-[13px]",
                i === at && "bg-surface-hover",
              )}
            >
              <span className="truncate">{product.name}</span>
              <span className="shrink-0 tabular-nums text-fg-muted">
                {formatMoney(product.price)}
              </span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

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

  /*
    « 24 juil. 2026 » until you touch it, then the browser's own date field.
    The native field printed the ISO form with a calendar icon on every row —
    a column of 2026-07-24 is the hardest way to read a date, and it was the
    first column. Committed on leaving rather than on every change: typing a
    year passes through 0002, 0020 and 0202 on its way to 2026, and each of
    those is a valid date that was being saved.
  */
  return (
    <span className="relative block">
      <input
        type="date"
        value={draft}
        aria-label={label}
        onClick={(e) => e.currentTarget.showPicker?.()}
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
        className={cn(CELL, "peer absolute inset-0 cursor-pointer tabular-nums opacity-0 focus:opacity-100")}
      />
      <span
        aria-hidden
        className="pointer-events-none block whitespace-nowrap px-2 py-1 text-[13px] tabular-nums text-fg-muted peer-focus:invisible"
      >
        {/^\d{4}-\d{2}-\d{2}$/.test(draft) ? formatLedgerDate(draft) : draft}
      </span>
    </span>
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
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  // grows with its lines, written to the element so a keystroke that leaves
  // the height unchanged cannot collapse it — see the Braindump draft box
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, open]);

  /*
    Three lines until you open it. The sheet's details run to ten bullet points
    (AXUM's landing page), and printed in full they made one row four hundred
    pixels tall beside columns with nothing in them — the whole table became
    the detail of one line. The full text is a click away, and on hover.
  */
  if (!open) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        title={value || undefined}
        data-col="detail"
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        className={cn(CELL, "min-h-7 cursor-text text-[13px] leading-[1.45] text-fg-muted")}
      >
        {/* clamped inside the padding: on the padded box, a sliver of the
            fourth line showed under the ellipsis */}
        <span className="line-clamp-3 whitespace-pre-line">{value}</span>
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      autoFocus
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
        setOpen(false);
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
      className={cn(CELL, "block resize-none overflow-hidden text-[13px] leading-[1.45] text-fg")}
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
  format = formatNumber,
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
  /** How it reads when you are not editing it; editing is always the plain number. */
  format?: (n: number | null) => string;
}) {
  const { draft, setDraft, editing, cancelled } = useDraft(format(value));

  const commit = () => {
    const parsed = parseAmount(draft);
    if (parsed === undefined) {
      toast.error(copy.billing.invalidNumber);
      setDraft(format(value));
      return;
    }
    if (parsed === null && keepOnEmpty) {
      setDraft(format(value));
      return;
    }
    setDraft(format(parsed));
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
        // the plain number to edit, selected: replacing it is what you usually
        // came to do, as in the sheet
        const el = e.currentTarget;
        setDraft(formatNumber(value));
        requestAnimationFrame(() => el.select());
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
            setDraft(format(value));
          },
          onMove,
        )
      }
      className={cn(
        CELL,
        "text-right text-[13px] tabular-nums",
        // a typed price is ink; a computed one prints as the placeholder, a step lighter
        strong && "font-medium placeholder:font-normal placeholder:text-fg-muted",
      )}
    />
  );
}
