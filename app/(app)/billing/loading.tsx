/*
  The one loading state the app allows itself: a skeleton, no spinner.

  These pages are rendered on the server from rows nobody else holds, so
  opening a client is a round trip. Without this the screen froze on the page
  you were leaving until the next one arrived, which reads as the click not
  having landed. Also covers /billing/[id].
*/
export default function BillingLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-busy>
      <div className="h-14 border-b border-border" />
      <div className="px-6 py-6">
        <div className="mb-6 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[62px] flex-1 animate-pulse rounded-md bg-surface" />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-sm bg-surface" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
