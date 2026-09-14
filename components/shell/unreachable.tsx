import { copy } from "@/lib/copy";

/**
 * The database did not answer — or answered and refused.
 *
 * Without this the shell fell back to `tasks ?? []` and the app rendered an
 * empty list — which says « Rien encore. Ajoute ta première tâche. » to
 * somebody who has forty. An empty state and a failed query look identical from
 * the inside and mean opposite things, and the wrong one of the two invites you
 * to type your work in again.
 *
 * Which of the two it was decides what this says, because they need opposite
 * things done about them.
 *
 * A failure with no SQLSTATE is the fetch itself failing: a paused project, a
 * dropped connection, a region that cannot be reached. On this plan that is
 * usually the pause — Supabase stops a free project after a week without
 * activity, which for two people is a long weekend — so the pause is named.
 *
 * A failure *with* a code is the database answering and saying no. The project
 * is awake and the message must not claim otherwise: this screen has already
 * sent somebody to a dashboard to wake a project that was running perfectly,
 * where there was nothing to do and nothing to explain what they were actually
 * looking at. The code is shown instead, because it is the only thing that
 * makes the next step possible.
 *
 * No retry button. A reload is the retry, everybody already knows how, and a
 * button that does the same thing while looking like it might do more is worse
 * than the sentence that says what to go and fix.
 */
export function Unreachable({ code }: { code?: string | null }) {
  // no code means the request never got an answer; a code means it got a refusal
  const silent = !code;

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[420px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {silent ? copy.error.unreachableTitle : copy.error.refusedTitle}
        </h1>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
          {silent ? copy.error.unreachableBody : copy.error.refusedBody}
        </p>
        <p className="mt-4 text-[13px] leading-relaxed text-fg-faint">
          {copy.error.unreachableNothingLost}
        </p>

        {/*
          The SQLSTATE, and nothing else. Not the driver's message, which is
          English jargon naming a constraint nobody here has heard of — the code
          is short enough to read out and is the part that identifies the fault.
        */}
        {!silent && (
          <p className="mt-4 font-mono text-[12px] text-fg-faint">{code}</p>
        )}
      </div>
    </main>
  );
}
