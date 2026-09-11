import { NextResponse } from "next/server";

/**
 * Where a client-side crash goes to be seen.
 *
 * A thrown component in production reached the browser console and stopped
 * there. Nobody is looking at the browser console of the person it happened to,
 * which means "the app broke for Guillaume on Tuesday" is a thing that can
 * happen twice before anyone hears about it.
 *
 * This is deliberately not an error-reporting service. The stack is locked, and
 * a vendor for two people would mean an account, an SDK in every bundle, and
 * task titles leaving the country — which is the one thing `ca-central-1` was
 * chosen to prevent. Writing to stderr is enough: it lands in the platform's
 * runtime logs, which is somewhere a person can actually look.
 *
 * What is sent is deliberately thin — a message, a digest, a path and a
 * truncated stack. Never a task, never a title, never a field's contents. A
 * crash report should describe the code, not the work.
 */
export const dynamic = "force-dynamic";

/** Enough for a useful frame or three, short enough that a loop cannot flood. */
const MAX_FIELD = 2000;

const clip = (value: unknown) =>
  typeof value === "string" ? value.slice(0, MAX_FIELD) : undefined;

/** A report is a few hundred bytes; anything larger is not a report. */
const MAX_BODY = 8192;

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return new NextResponse(null, { status: 204 });

  // a report that fails must never itself be an error the user sees
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return new NextResponse(null, { status: 204 });
    const body = JSON.parse(raw);

    console.error(
      "[kua] client crash",
      JSON.stringify({
        message: clip(body?.message) ?? "(none)",
        digest: clip(body?.digest),
        path: clip(body?.path),
        stack: clip(body?.stack),
        // when the report arrived, in UTC, for a log line. Not a calendar
        // day and not shown to anybody, so lib/time.ts has no part in it
        at: new Date().toISOString(),
      }),
    );
  } catch {
    console.error("[kua] client crash (unreadable report)");
  }

  // 204: the browser has nothing to do with the answer
  return new NextResponse(null, { status: 204 });
}
