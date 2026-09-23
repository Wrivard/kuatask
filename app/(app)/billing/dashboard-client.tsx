"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronRight, Plus, Search } from "lucide-react";
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
  DEFAULT_RATE,
  formatMoney,
  isBlankEntry,
  taxesOn,
  nextSort,
  sortClients,
  totals,
  type Sort,
  type SortKey,
  type Totals,
} from "@/lib/billing";
import { formatLedgerDate, instantToDay, monthsAgoDay } from "@/lib/time";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { normalize } from "@/lib/search";
import type { Client, Entry } from "./data";
import { BillingTabs } from "./tabs";
import { NewClientForm } from "./new-client-form";
import { FIELD, PRIMARY } from "./ui";

/** Older than this, a payload came from the router cache rather than the server. */
const STALE_AFTER_MS = 5_000;

type Money = Pick<
  Entry,
  | "client_id"
  | "entry_on"
  | "hours"
  | "rate"
  | "amount"
  | "status"
  | "updated_at"
  | "title"
  | "detail"
>;

/*
  How far back the page is looking. Months rather than 30-day blocks, and
  « Tout » first: the page's main job is the money owed, which has no period —
  the others answer « what did we bill since the spring ».
*/
const PERIODS = [
  { key: "all", months: 0 },
  { key: "m1", months: 1 },
  { key: "m3", months: 3 },
  { key: "m6", months: 6 },
  { key: "y1", months: 12 },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

/**
 * The client list, with the money beside each name.
 *
 * Sorted by what is still owed, largest first, because "who do we need to
 * invoice or chase" is the question this page is opened to answer. Name is the
 * tie-break, so clients with nothing outstanding sit in the order you would
 * look for them.
 */
export function BillingDashboard({
  initialClients,
  entries,
  workspaceId,
  renderedAt,
}: {
  initialClients: Client[];
  entries: Money[];
  workspaceId: string;
  /** When the server produced this payload, so a cached one can be told apart. */
  renderedAt: number;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  /*
    The server's list plus any client created here that the server has not
    returned yet. Derived rather than copied into state, so a refresh — from
    realtime, or from coming back to this page — replaces it instead of being
    ignored by a useState that only reads its initial value once.
  */
  const [created, setCreated] = React.useState<Client[]>([]);
  /*
    Status changes made from this list, ahead of the server. A client archived
    here leaves « Actifs » on the click, not after the round trip.
  */
  const [statusOf, setStatusOf] = React.useState<Record<string, string | null>>({});
  const clients = React.useMemo(() => {
    const known = new Set(initialClients.map((c) => c.id));
    return [...initialClients, ...created.filter((c) => !known.has(c.id))].map((c) =>
      c.id in statusOf ? { ...c, archived_at: statusOf[c.id] } : c,
    );
  }, [initialClients, created, statusOf]);

  // once the server agrees, the override has done its job; keeping it would
  // hide a later change made from the other screen
  React.useEffect(() => {
    setStatusOf((s) => {
      const left = Object.fromEntries(
        // archived or not is what matters; the server's timestamp is formatted
        // differently from ours and would never compare equal as text
        Object.entries(s).filter(([id, v]) => {
          const server = initialClients.find((c) => c.id === id);
          return !server || (server.archived_at !== null) !== (v !== null);
        }),
      );
      return Object.keys(left).length === Object.keys(s).length ? s : left;
    });
  }, [initialClients]);

  function setStatus(client: Client, archived: boolean) {
    const before = client.archived_at;
    const next = archived ? new Date().toISOString() : null;
    setStatusOf((s) => ({ ...s, [client.id]: next }));

    const put = (value: string | null) =>
      supabase.from("clients").update({ archived_at: value }).eq("id", client.id);

    void (async () => {
      const { error } = await put(next);
      if (error) {
        setStatusOf((s) => ({ ...s, [client.id]: before }));
        toast.error(copy.billing.saveFailed);
        return;
      }
      /*
        The row just left the tab you are looking at, so say where it went and
        offer it back — the same promise every other move in the app makes.
      */
      toast(
        copy.billing.statusChanged(
          client.name,
          archived ? copy.billing.clientStatus.archived : copy.billing.clientStatus.active,
        ),
        {
          action: {
            label: copy.toast.undo,
            onClick: () => {
              setStatusOf((s) => ({ ...s, [client.id]: before }));
              void put(before);
            },
          },
        },
      );
    })();
  }

  const [showArchived, setShowArchived] = React.useState(false);
  /*
    « Qui dois-je facturer ? » and « qui dois-je relancer ? » are the two
    questions this page is opened with. Clicking À facturer or Facturé narrows
    the list to the clients that answer it, largest first; clicking again, or
    the other tab, lets go.
  */
  const [owing, setOwing] = React.useState<"pending" | "invoiced" | "outstanding" | null>(null);
  /*
    The column you clicked, or none for the default order. Kept in state rather
    than in the URL: it is how you are reading the list this minute, not where
    you are — a sorted list is not a place to come back to.
  */
  const [sort, setSort] = React.useState<Sort | null>(null);
  const [period, setPeriod] = React.useState<PeriodKey>("all");

  /*
    The lines the page is counting. A period keeps the ones worked in it — by
    their own date, the day the work happened, rather than the day somebody
    last touched the row.
  */
  const months = PERIODS.find((p) => p.key === period)?.months ?? 0;
  const since = months > 0 ? monthsAgoDay(months) : null;
  const scoped = React.useMemo(() => {
    /*
      Blank rows are not work. « Ajouter une ligne » writes the row before you
      type into it, so an abandoned one would otherwise put today's date in
      « dernière activité » and pull its client into a period, for a line that
      says nothing. Deleting it takes it out of the table entirely; this is for
      the ones still sitting there empty.
    */
    const real = entries.filter((e) => !isBlankEntry(e));
    return since ? real.filter((e) => e.entry_on >= since) : real;
  }, [entries, since]);
  const [draft, setDraft] = React.useState("");
  const query = normalize(draft.trim());
  /** The new-client form, open, and the name it opened with (from the search). */
  const [creating, setCreating] = React.useState<{ name: string } | null>(null);

  /*
    Live, coarsely. Any change to a client or a row in this workspace re-reads
    the page from the server; the sums are arithmetic over rows this page never
    holds individually, so re-reading is simpler and more honest than patching
    totals by hand. Debounced so a burst of edits on the other screen is one read.

    Also re-read when coming back to it: the back button restores the last
    render of this page from the router cache, totals and all, which after
    marking something paid on a client's sheet is exactly the wrong number.
  */
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    if (Date.now() - renderedAt > STALE_AFTER_MS) router.refresh();

    const channel = supabase
      .channel(`billing-dashboard:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "billing_entries", filter: `workspace_id=eq.${workspaceId}` },
        refresh,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clients", filter: `workspace_id=eq.${workspaceId}` },
        refresh,
      )
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, router, workspaceId, renderedAt]);

  const rows = React.useMemo(() => {
    const byClient = new Map<string, Money[]>();
    for (const e of scoped) {
      byClient.set(e.client_id, [...(byClient.get(e.client_id) ?? []), e]);
    }

    const shown = clients
      // typing searches both lists: finding a client should not depend on
      // remembering whether you archived it
      .filter((c) =>
        query ? normalize(c.name).includes(query) : (c.archived_at !== null) === showArchived,
      )
      .map((c) => {
        const own = byClient.get(c.id) ?? [];
        /*
          The last thing done on this client, not the last day a line is dated
          for: marking an invoice paid today is activity, and a line dated next
          month is not. Both are considered, so a row written today for a
          future date still counts as today's work.
        */
        const last = own.reduce<string | null>((max, e) => {
          const touched = instantToDay(e.updated_at);
          const day = touched > e.entry_on ? touched : e.entry_on;
          return max === null || day > max ? day : max;
        }, null);
        return { client: c, t: totals(own, c.default_rate), last };
      })
      .filter((r) => !owing || r.t[owing] > 0)
      // inside a period, a client with nothing in it is not part of the answer
      .filter((r) => !since || (byClient.get(r.client.id)?.length ?? 0) > 0);

    /*
      Ordered by lib/billing.ts, where the rules are written down and tested:
      the default is what is owed then what moved last, and a clicked column
      sorts by itself with the name as the tie-break.
    */
    return sortClients(
      shown.map((r) => ({
        ...r,
        name: r.client.name,
        archived: r.client.archived_at !== null,
        activity: r.last ?? instantToDay(r.client.created_at),
        pending: r.t.pending,
        invoiced: r.t.invoiced,
        paid: r.t.paid,
        outstanding: r.t.outstanding,
      })),
      sort,
    );
  }, [clients, scoped, showArchived, query, owing, sort, since]);

  // the tiles count active clients only: an archived one is settled history
  const overall = React.useMemo(() => {
    const active = new Set(clients.filter((c) => c.archived_at === null).map((c) => c.id));
    const rate = new Map(clients.map((c) => [c.id, c.default_rate]));
    const sum: Totals = { pending: 0, invoiced: 0, paid: 0, outstanding: 0, all: 0 };
    for (const e of scoped) {
      if (!active.has(e.client_id)) continue;
      const t = totals([e], rate.get(e.client_id) ?? DEFAULT_RATE);
      for (const k of Object.keys(sum) as (keyof Totals)[]) sum[k] += t[k];
    }
    return sum;
  }, [clients, scoped]);

  const exact = query ? clients.find((c) => normalize(c.name) === query) : undefined;

  /*
    Enter opens the client you typed if it exists, or the only one that
    matches. The box is a search now and only a search: creating lives behind
    its own button, where the rate can be asked for too.
  */
  function submit() {
    if (!query) return;
    if (exact) return router.push(`/billing/${exact.id}`);
    if (rows.length === 1) return router.push(`/billing/${rows[0].client.id}`);
    if (rows.length === 0) setCreating({ name: draft.trim() });
  }

  function create(name: string, rate: number) {
    const client: Client = {
      id: crypto.randomUUID(),
      name,
      default_rate: rate,
      archived_at: null,
      created_at: new Date().toISOString(),
    };

    // in the list on this frame; the sheet opens once the row exists to open
    setCreated((c) => [...c, client]);
    setCreating(null);
    setDraft("");
    setShowArchived(false);

    void (async () => {
      const { error } = await supabase
        .from("clients")
        .insert({ ...client, workspace_id: workspaceId });
      if (error) {
        setCreated((c) => c.filter((x) => x.id !== client.id));
        toast.error(copy.billing.saveFailed);
        return;
      }
      router.push(`/billing/${client.id}`);
    })();
  }

  return (
    <div className="max-w-[1160px] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <BillingTabs className="mb-0" />

        {/* how far back the figures and the list are looking */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODS.map((p) => (
            <Chip key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
              {copy.billing.period[p.key]}
            </Chip>
          ))}
        </div>
      </div>

      {/*
        Three figures, in the order money moves: earned and not yet billed,
        billed and not yet paid, paid. The first two are what needs doing.
      */}
      {/*
        The money, in the order it moves: earned and not yet billed, billed and
        not yet paid, the two together — what is owed you — then the tax that
        will ride on top of it, then what has actually landed.

        Every figure but Taxes is before tax, and Taxes is kept apart for that
        reason: it is the government's money passing through, and adding it to
        Payé would overstate the year by about fifteen per cent.
      */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile
          label={copy.billing.status.pending}
          value={overall.pending}
          color="var(--color-fg-muted)"
          active={owing === "pending"}
          hint={copy.billing.showOwing.pending}
          onClick={() => {
            setOwing((o) => (o === "pending" ? null : "pending"));
            setShowArchived(false);
          }}
        />
        <Tile
          label={copy.billing.status.invoiced}
          value={overall.invoiced}
          color={ACCENTS.amber}
          active={owing === "invoiced"}
          hint={copy.billing.showOwing.invoiced}
          onClick={() => {
            setOwing((o) => (o === "invoiced" ? null : "invoiced"));
            setShowArchived(false);
          }}
        />
        <Tile
          label={copy.billing.overdue}
          value={overall.outstanding}
          color={ACCENTS.blue}
          active={owing === "outstanding"}
          hint={copy.billing.showOwing.outstanding}
          onClick={() => {
            setOwing((o) => (o === "outstanding" ? null : "outstanding"));
            setShowArchived(false);
          }}
        />
        {/* what was collected with the paid money, and is owed to Revenu Québec */}
        <Tile
          label={copy.billing.taxesCollected}
          value={taxesOn(overall.paid).gst + taxesOn(overall.paid).qst}
          color={ACCENTS.purple}
          hint={copy.billing.taxesHint}
        />
        {/* on a phone the fifth tile would sit alone on a third row; it takes the row */}
        <Tile
          label={copy.billing.status.paid}
          value={overall.paid}
          color="var(--color-accent)"
          hint={copy.billing.beforeTax}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip active={!showArchived && !owing} onClick={() => { setShowArchived(false); setOwing(null); }}>
          {copy.billing.active}
        </Chip>
        <Chip active={showArchived} onClick={() => { setShowArchived(true); setOwing(null); }}>
          {copy.billing.archived}
        </Chip>

        <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
          <span className="relative flex-1 sm:w-[240px] sm:flex-none">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-faint"
              strokeWidth={1.5}
            />
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") setDraft("");
              }}
              maxLength={120}
              placeholder={copy.billing.findClient}
              aria-label={copy.billing.findClient}
              className={cn(FIELD, "pl-8")}
            />
          </span>

          {!creating && (
            <button type="button" onClick={() => setCreating({ name: "" })} className={PRIMARY}>
              <Plus className="size-4" strokeWidth={2} aria-hidden />
              {copy.billing.newClient}
            </button>
          )}
        </div>
      </div>

      {creating && (
        <NewClientForm
          clients={clients}
          initialName={creating.name}
          onCreate={create}
          onCancel={() => setCreating(null)}
        />
      )}

      {/*
        Nothing matched: say so, and offer to create it — below the (empty)
        results rather than above them, and only when nothing is close.
      */}
      {query && rows.length === 0 && !creating && (
        <p className="py-6 text-[13px] text-fg-muted">
          {copy.billing.noMatch}{" "}
          <button
            type="button"
            onClick={() => setCreating({ name: draft.trim() })}
            className="font-medium text-accent underline underline-offset-2"
          >
            {copy.billing.createNamed(draft.trim())}
          </button>
        </p>
      )}

      {rows.length === 0 ? (
        query ? null : (
          <p className="py-6 text-[13px] text-fg-muted">
            {showArchived ? copy.billing.noArchived : copy.billing.noClients}
          </p>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] sm:min-w-[560px] border-collapse text-[14px]">
            <thead>
              {/*
                Every heading sorts. Down, then up, then back to the default —
                so there is always a way out of an order you did not want, and
                what you get back is the order the page opens on.
              */}
              <tr className="border-b border-border text-left">
                <SortHeader sort={sort} onSort={setSort} column="name">
                  {copy.billing.clients}
                </SortHeader>
                <SortHeader sort={sort} onSort={setSort} column="pending" right>
                  {copy.billing.status.pending}
                </SortHeader>
                <SortHeader sort={sort} onSort={setSort} column="invoiced" right>
                  {copy.billing.status.invoiced}
                </SortHeader>
                {/* paid is history; on a phone the column goes to what is still owed */}
                <SortHeader sort={sort} onSort={setSort} column="paid" right className="hidden sm:table-cell">
                  {copy.billing.status.paid}
                </SortHeader>
                {/* the one column a phone can do without; the money is what it is opened for */}
                <SortHeader sort={sort} onSort={setSort} column="last" right className="hidden sm:table-cell">
                  {copy.billing.lastActivity}
                </SortHeader>
                <SortHeader sort={sort} onSort={setSort} column="status">
                  {copy.billing.statusLabel}
                </SortHeader>
                <th className="w-6" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ client, t, last }) => (
                <tr
                  key={client.id}
                  onClick={(e) => {
                    // the name is a real link and navigates on its own; a second
                    // push from the row would put the page in history twice
                    if ((e.target as HTMLElement).closest("a, select")) return;
                    router.push(`/billing/${client.id}`);
                  }}
                  className="group cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-hover"
                >
                  <td className="py-2.5 pr-3">
                    {/* the real link, so it is a tab stop and opens in a new tab */}
                    <Link
                      href={`/billing/${client.id}`}
                      className="font-medium text-fg outline-none focus-visible:underline focus-visible:decoration-accent focus-visible:underline-offset-4"
                    >
                      {client.name}
                    </Link>
                  </td>
                  <MoneyCell value={t.pending} emphasis />
                  <MoneyCell value={t.invoiced} emphasis />
                  <MoneyCell value={t.paid} className="hidden sm:table-cell" />
                  <td className="hidden py-2.5 pr-3 text-right text-[12px] tabular-nums text-fg-faint sm:table-cell">
                    {last ? formatLedgerDate(last) : copy.billing.never}
                  </td>
                  <td className="py-1.5 pr-3">
                    <StatusSelect
                      archived={client.archived_at !== null}
                      onChange={(archived) => setStatus(client, archived)}
                    />
                  </td>
                  <td className="py-2.5 text-fg-faint">
                    <ChevronRight className="size-4 opacity-0 group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Same tile as a client's sheet: a status dot, the label, the sum. */
/**
 * Same tile as a client's sheet: a status dot, the label, the sum. With an
 * onClick it is also a filter, and says so on hover and when pressed.
 */
function Tile({
  label,
  value,
  color,
  active = false,
  hint,
  onClick,
  className,
}: {
  label: string;
  value: number;
  color: string;
  active?: boolean;
  hint?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      <dt className={cn(MICRO_LABEL, "flex items-center gap-1.5")}>
        <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1 text-[15px] font-medium tabular-nums tracking-[-0.01em] sm:text-[20px]",
          value > 0 ? "text-fg" : "text-fg-faint",
        )}
      >
        {formatMoney(value)}
      </dd>
      {hint && (
        <dd
          className={cn(
            "mt-1 hidden text-[12px] sm:block",
            active ? "text-accent" : "text-fg-faint group-hover:text-fg-muted",
          )}
        >
          {active ? copy.billing.showingOwing : hint}
        </dd>
      )}
    </>
  );

  const base = cn("min-w-0 rounded-md border px-3 py-2.5 text-left sm:px-4 sm:py-3", className);
  if (!onClick)
    return (
      <div className={cn(base, "border-border")}>
        <dl>{body}</dl>
      </div>
    );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={value === 0 && !active}
      className={cn(
        base,
        "group transition-colors disabled:cursor-default",
        active ? "border-accent bg-accent/5" : "border-border enabled:hover:border-control",
      )}
    >
      <dl>{body}</dl>
    </button>
  );
}

/**
 * A column heading that sorts, and says which way.
 *
 * `aria-sort` on the cell is what a screen reader reads; the arrow is for
 * everyone else. The button fills the cell, so the target is the heading
 * rather than the word inside it.
 */
function SortHeader({
  column,
  sort,
  onSort,
  right = false,
  className,
  children,
}: {
  column: SortKey;
  sort: Sort | null;
  onSort: (next: Sort | null) => void;
  right?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const on = sort?.key === column;
  return (
    <th
      aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={cn("whitespace-nowrap py-1 pr-3", className)}
    >
      <button
        type="button"
        onClick={() => onSort(nextSort(sort, column))}
        className={cn(
          MICRO_LABEL,
          "group/sort flex w-full items-center gap-1 rounded-sm py-1 font-medium hover:text-fg",
          on && "text-fg",
          right && "justify-end",
        )}
      >
        {children}
        {on ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3" strokeWidth={2.5} aria-hidden />
          ) : (
            <ArrowDown className="size-3" strokeWidth={2.5} aria-hidden />
          )
        ) : (
          <ArrowDown
            className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-40"
            strokeWidth={2.5}
            aria-hidden
          />
        )}
      </button>
    </th>
  );
}

/** A zero is a dash, so the amounts that matter are the only numbers in the column. */
function MoneyCell({
  value,
  emphasis = false,
  className,
}: {
  value: number;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap py-2.5 pr-3 text-right text-[13px] tabular-nums",
        className,
        value === 0 ? "text-fg-faint" : emphasis ? "text-fg" : "text-fg-muted",
      )}
    >
      {value === 0 ? copy.billing.never : formatMoney(value)}
    </td>
  );
}

/**
 * Actif / Archivé, as a pill you can change without opening the client.
 *
 * It lived only in the client's settings, two clicks deep behind a button
 * that did not say « modifier » — so it was not found at all.
 */
function StatusSelect({
  archived,
  onChange,
}: {
  archived: boolean;
  onChange: (archived: boolean) => void;
}) {
  const colour = (a: boolean) => (a ? "var(--color-fg-muted)" : "var(--color-accent)");
  const dot = (a: boolean) => (
    <span
      aria-hidden
      className="size-1.5 shrink-0 rounded-full"
      style={{ backgroundColor: colour(a) }}
    />
  );

  return (
    <Select
      value={archived ? "archived" : "active"}
      onValueChange={(v) => onChange(v === "archived")}
    >
      <SelectTrigger
        aria-label={copy.billing.statusLabel}
        className="h-7 px-2.5 font-medium"
        style={{
          color: colour(archived),
          backgroundColor: `color-mix(in srgb, ${colour(archived)} 13%, transparent)`,
        }}
      >
        <span className="flex items-center gap-1.5">
          {dot(archived)}
          {archived ? copy.billing.clientStatus.archived : copy.billing.clientStatus.active}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">
          <span className="flex items-center gap-2">
            {dot(false)}
            {copy.billing.clientStatus.active}
          </span>
        </SelectItem>
        <SelectItem value="archived">
          <span className="flex items-center gap-2">
            {dot(true)}
            {copy.billing.clientStatus.archived}
          </span>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
