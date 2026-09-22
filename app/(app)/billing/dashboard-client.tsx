"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Chip } from "@/components/ui/chip";
import { DEFAULT_RATE, formatMoney, totals, type Totals } from "@/lib/billing";
import { formatLedgerDate } from "@/lib/time";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { Client, Entry } from "./data";

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
}: {
  initialClients: Client[];
  entries: Money[];
  workspaceId: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [clients, setClients] = React.useState(initialClients);
  const [showArchived, setShowArchived] = React.useState(false);
  const [draft, setDraft] = React.useState("");

  const rows = React.useMemo(() => {
    const byClient = new Map<string, Money[]>();
    for (const e of entries) {
      byClient.set(e.client_id, [...(byClient.get(e.client_id) ?? []), e]);
    }

    return clients
      .filter((c) => (c.archived_at !== null) === showArchived)
      .map((c) => {
        const own = byClient.get(c.id) ?? [];
        const last = own.reduce<string | null>(
          (max, e) => (max === null || e.entry_on > max ? e.entry_on : max),
          null,
        );
        return { client: c, t: totals(own, c.default_rate), last };
      })
      .sort((a, b) => b.t.outstanding - a.t.outstanding || a.client.name.localeCompare(b.client.name, "fr"));
  }, [clients, entries, showArchived]);

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
    setClients((c) => [...c, client]);
    setDraft("");
    setShowArchived(false);

    void (async () => {
      const { error } = await supabase
        .from("clients")
        .insert({ ...client, workspace_id: workspaceId });
      if (error) {
        setClients((c) => c.filter((x) => x.id !== client.id));
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
              create();
            }
          }}
          maxLength={120}
          placeholder={copy.billing.newClientPlaceholder}
          aria-label={copy.billing.newClient}
          className={cn(
            "ml-auto h-8 w-full rounded-sm border border-control bg-bg px-2.5 text-[13px] text-fg sm:w-[260px]",
            "placeholder:text-fg-faint focus-visible:border-accent focus-visible:outline-none",
          )}
        />
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-[13px] text-fg-muted">
          {showArchived ? copy.billing.noArchived : copy.billing.noClients}
        </p>
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
                  onClick={() => router.push(`/billing/${client.id}`)}
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
