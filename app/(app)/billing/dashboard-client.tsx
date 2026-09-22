"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/chip";
import { ACCENTS } from "@/components/task/assignee-dot";
import { DEFAULT_RATE, formatMoney, totals, type Totals } from "@/lib/billing";
import { formatLedgerDate } from "@/lib/time";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { normalize } from "@/lib/search";
import type { Client, Entry } from "./data";
import { NewClientForm } from "./new-client-form";
import { FIELD, PRIMARY } from "./ui";

/** Older than this, a payload came from the router cache rather than the server. */
const STALE_AFTER_MS = 5_000;

type Money = Pick<Entry, "client_id" | "entry_on" | "hours" | "rate" | "amount" | "status">;

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
  const clients = React.useMemo(() => {
    const known = new Set(initialClients.map((c) => c.id));
    return [...initialClients, ...created.filter((c) => !known.has(c.id))];
  }, [initialClients, created]);

  const [showArchived, setShowArchived] = React.useState(false);
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
    for (const e of entries) {
      byClient.set(e.client_id, [...(byClient.get(e.client_id) ?? []), e]);
    }

    return clients
      // typing searches both lists: finding a client should not depend on
      // remembering whether you archived it
      .filter((c) =>
        query ? normalize(c.name).includes(query) : (c.archived_at !== null) === showArchived,
      )
      .map((c) => {
        const own = byClient.get(c.id) ?? [];
        const last = own.reduce<string | null>(
          (max, e) => (max === null || e.entry_on > max ? e.entry_on : max),
          null,
        );
        return { client: c, t: totals(own, c.default_rate), last };
      })
      .sort((a, b) => b.t.outstanding - a.t.outstanding || a.client.name.localeCompare(b.client.name, "fr"));
  }, [clients, entries, showArchived, query]);

  // the tiles count active clients only: an archived one is settled history
  const overall = React.useMemo(() => {
    const active = new Set(clients.filter((c) => c.archived_at === null).map((c) => c.id));
    const rate = new Map(clients.map((c) => [c.id, c.default_rate]));
    const sum: Totals = { pending: 0, invoiced: 0, paid: 0, outstanding: 0, all: 0 };
    for (const e of entries) {
      if (!active.has(e.client_id)) continue;
      const t = totals([e], rate.get(e.client_id) ?? DEFAULT_RATE);
      for (const k of Object.keys(sum) as (keyof Totals)[]) sum[k] += t[k];
    }
    return sum;
  }, [clients, entries]);

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
    <div className="max-w-[960px] px-6 py-6">
      {/*
        Three figures, in the order money moves: earned and not yet billed,
        billed and not yet paid, paid. The first two are what needs doing.
      */}
      <dl className="mb-6 grid grid-cols-3 gap-2">
        <Tile label={copy.billing.status.pending} value={overall.pending} color="var(--color-fg-muted)" />
        <Tile label={copy.billing.status.invoiced} value={overall.invoiced} color={ACCENTS.amber} />
        <Tile label={copy.billing.status.paid} value={overall.paid} color="var(--color-accent)" />
      </dl>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip active={!showArchived} onClick={() => setShowArchived(false)}>
          {copy.billing.active}
        </Chip>
        <Chip active={showArchived} onClick={() => setShowArchived(true)}>
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
              <tr className="border-b border-border text-left">
                <th className={cn(MICRO_LABEL, "py-2 pr-3 font-medium")}>{copy.billing.clients}</th>
                <th className={cn(MICRO_LABEL, "py-2 pr-3 text-right font-medium")}>{copy.billing.status.pending}</th>
                <th className={cn(MICRO_LABEL, "py-2 pr-3 text-right font-medium")}>{copy.billing.status.invoiced}</th>
                <th className={cn(MICRO_LABEL, "py-2 pr-3 text-right font-medium")}>{copy.billing.status.paid}</th>
                {/* the one column a phone can do without; the money is what it is opened for */}
                <th className={cn(MICRO_LABEL, "hidden py-2 pr-3 text-right font-medium sm:table-cell")}>{copy.billing.lastEntry}</th>
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
                    if ((e.target as HTMLElement).closest("a")) return;
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
                    {client.archived_at !== null && (
                      <span className="ml-2 text-[12px] text-fg-faint">{copy.billing.archivedBadge}</span>
                    )}
                  </td>
                  <MoneyCell value={t.pending} emphasis />
                  <MoneyCell value={t.invoiced} emphasis />
                  <MoneyCell value={t.paid} />
                  <td className="hidden py-2.5 pr-3 text-right text-[12px] tabular-nums text-fg-faint sm:table-cell">
                    {last ? formatLedgerDate(last) : copy.billing.never}
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
function Tile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border px-3 py-2.5 sm:px-4 sm:py-3">
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
    </div>
  );
}

/** A zero is a dash, so the amounts that matter are the only numbers in the column. */
function MoneyCell({ value, emphasis = false }: { value: number; emphasis?: boolean }) {
  return (
    <td
      className={cn(
        "py-2.5 pr-3 text-right text-[13px] tabular-nums",
        value === 0 ? "text-fg-faint" : emphasis ? "text-fg" : "text-fg-muted",
      )}
    >
      {value === 0 ? copy.billing.never : formatMoney(value)}
    </td>
  );
}
