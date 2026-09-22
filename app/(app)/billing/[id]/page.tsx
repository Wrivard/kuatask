import { notFound } from "next/navigation";
import { Header } from "@/components/shell/header";
import { Unreachable } from "@/components/shell/unreachable";
import { ClientSheet } from "../sheet-client";
import { CLIENT_COLUMNS, ENTRY_COLUMNS, toClient, toEntry, type Entry } from "../data";
import { billingContext } from "../context";

export const dynamic = "force-dynamic";

/** One client's tab of the spreadsheet. */
export default async function ClientBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // not a uuid is not a client, and asking Postgres would only earn a 22P02
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { supabase, workspaceId } = await billingContext();

  const [clients, entries] = await Promise.all([
    // all of them, for the switcher
    supabase.from("clients").select(CLIENT_COLUMNS).order("name"),
    supabase
      .from("billing_entries")
      .select(ENTRY_COLUMNS)
      .eq("client_id", id)
      .order("entry_on", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const error = clients.error ?? entries.error;
  if (error) return <Unreachable code={error.code ?? null} />;

  const all = (clients.data ?? []).map(toClient);
  const client = all.find((c) => c.id === id);
  if (!client) notFound();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title={client.name} search={false} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* keyed, so switching client resets the sheet rather than merging two */}
        <ClientSheet
          key={client.id}
          client={client}
          clients={all}
          initial={((entries.data ?? []) as Entry[]).map(toEntry)}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}
