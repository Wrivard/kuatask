import { copy } from "@/lib/copy";

/**
 * The database did not answer.
 *
 * Without this the shell fell back to `tasks ?? []` and the app rendered an
 * empty list — which says « Rien encore. Ajoute ta première tâche. » to
 * somebody who has forty. An empty state and a failed query look identical from
 * the inside and mean opposite things, and the wrong one of the two invites you
 * to type your work in again.
 *
 * The likely cause is named because on this plan it usually is the cause:
 * Supabase pauses a free project after a week without activity, which for two
 * people is a long weekend. `supabase/README.md` has the rest.
 *
 * No retry button. A reload is the retry, everybody already knows how, and a
 * button that does the same thing while looking like it might do more is worse
 * than the sentence that says what to go and fix.
 */
export function Unreachable() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[420px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {copy.error.unreachableTitle}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
          {copy.error.unreachableBody}
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-fg-faint">
          {copy.error.unreachableNothingLost}
        </p>
      </div>
    </main>
  );
}
