import Link from "next/link";
import { Header } from "@/components/shell/header";
import { copy } from "@/lib/copy";

/*
  A client that is not there: a stale link, or one the other person deleted
  while this tab had it open. The app-wide 404 sent you out of the app shell
  and back to the task list, which is two steps from where you were going.
*/
export default function ClientNotFound() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title={copy.nav.billing} search={false} />
      <div className="px-6 py-6">
        <p className="text-[13px] text-fg-muted">{copy.billing.clientMissing}</p>
        <Link
          href="/billing"
          className="mt-3 inline-block text-[13px] text-accent underline underline-offset-2"
        >
          {copy.billing.allClients}
        </Link>
      </div>
    </div>
  );
}
