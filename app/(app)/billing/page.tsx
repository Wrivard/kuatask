import { Header } from "@/components/shell/header";
import { Unreachable } from "@/components/shell/unreachable";
import { copy } from "@/lib/copy";
import { BillingDashboard } from "./dashboard-client";
import { billingContext, CLIENT_COLUMNS, toClient, toEntry, type Entry } from "./data";

export const dynamic = "force-dynamic";

/**
 * Every client, and what each of them owes.
 *
 * The spreadsheet had one tab per client and no page that added them up, so
 * "who still owes us" meant opening every tab. This is that page.
 */
export default async function BillingPage() {
  const { supabase, workspaceId } = await billingContext();

  const [clients, entries] = await Promise.all([
    supabase.from("clients").select(CLIENT_COLUMNS).order("name"),
    // only what the sums need — the dashboard never shows a row's text
    supabase.from("billing_entries").select("client_id, entry_on, hours, rate, amount, status"),
  ]);

  const error = clients.error ?? entries.error;
  if (error) return <Unreachable code={error.code ?? null} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title={copy.nav.billing} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <BillingDashboard
          initialClients={(clients.data ?? []).map(toClient)}
          entries={((entries.data ?? []) as Pick<Entry, "client_id" | "entry_on" | "hours" | "rate" | "amount" | "status">[]).map(toEntry)}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}
