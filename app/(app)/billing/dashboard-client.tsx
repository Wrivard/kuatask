"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/chip";
import { DEFAULT_RATE, formatMoney, totals, type Totals } from "@/lib/billing";
import { formatLedgerDate } from "@/lib/time";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { normalize } from "@/lib/search";
import type { Client, Entry } from "./data";

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
    Enter opens the client you typed if it exists — the list is also the
    search — and creates it only when it does not. Two « GCSM » tabs would split
    one client's history in two.
  */
  function submit() {
    if (!query) return;
    if (exact) return router.push(`/billing/${exact.id}`);
    if (rows.length === 1) return router.push(`/billing/${rows[0].client.id}`);
    create();
  }

  function create() {
    const name = draft.trim();
    if (!name) return;

    const client: Client = {
      id: crypto.randomUUID(),
      name,
      default_rate: DEFAULT_RATE,
      archived_at: null,
    };

    // in the list on this frame; the sheet opens once the row exists to open
    setCreated((c) => [...c, client]);
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
      <dl className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile label={copy.billing.status.pending} value={overall.pending} strong={overall.pending > 0} />
        <Tile label={copy.billing.status.invoiced} value={overall.invoiced} strong={overall.invoiced > 0} />
        <Tile label={copy.billing.status.paid} value={overall.paid} />
      </dl>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Chip active={!showArchived} onClick={() => setShowArchived(false)}>
          {copy.billing.active}
        </Chip>
        <Chip active={showArchived} onClick={() => setShowArchived(true)}>
          {copy.billing.archived}
        </Chip>

        <input
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
          placeholder={copy.billing.findOrCreate}
          aria-label={copy.billing.findOrCreate}
          className={cn(
            "ml-auto h-8 w-full rounded-sm border border-control bg-bg px-2.5 text-[13px] text-fg sm:w-[260px]",
            "placeholder:text-fg-faint focus-visible:border-accent focus-visible:outline-none",
          )}
        />
      </div>

      {query && !exact && (
        <button
          type="button"
          onClick={create}
          className="mb-3 flex h-9 w-full items-center gap-2 rounded-sm border border-dashed border-control px-3 text-left text-[13px] text-fg-muted hover:border-accent hover:text-fg"
        >
          <Plus className="size-4" strokeWidth={1.5} aria-hidden />
          {copy.billing.createNamed(draft.trim())}
        </button>
      )}

      {rows.length === 0 ? (
        query ? null : (
          <p className="py-6 text-[13px] text-fg-muted">
            {showArchived ? copy.billing.noArchived : copy.billing.noClients}
          </p>
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className={cn(MICRO_LABEL, "py-2 pr-3 font-medium")}>{copy.billing.clients}</th>
                <th className={cn(MICRO_LABEL, "py-2 pr-3 text-right font-medium")}>{copy.billing.status.pending}</th>
                <th className={cn(MICRO_LABEL, "py-2 pr-3 text-right font-medium")}>{copy.billing.status.invoiced}</th>
                <th className={cn(MICRO_LABEL, "py-2 pr-3 text-right font-medium")}>{copy.billing.status.paid}</th>
                <th className={cn(MICRO_LABEL, "py-2 pr-3 text-right font-medium")}>{copy.billing.lastEntry}</th>
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
                  <td className="py-2.5 pr-3 text-right text-[12px] tabular-nums text-fg-faint">
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

function Tile({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <dt className={MICRO_LABEL}>{label}</dt>
      <dd className={cn("mt-1 font-mono text-[20px] tabular-nums", strong ? "text-fg" : "text-fg-muted")}>
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
        "py-2.5 pr-3 text-right font-mono text-[13px] tabular-nums",
        value === 0 ? "text-fg-faint" : emphasis ? "text-fg" : "text-fg-muted",
      )}
    >
      {value === 0 ? copy.billing.never : formatMoney(value)}
    </td>
  );
}
