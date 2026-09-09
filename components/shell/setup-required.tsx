import { copy } from "@/lib/copy";

/**
 * Shown instead of crashing when the server cannot read its Supabase config.
 *
 * A misconfigured deploy previously surfaced as "a server-side exception has
 * occurred" plus a digest, which says nothing to the person looking at it. The
 * variable names are not secret, so the screen names them and the fix.
 */
const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
];

export function SetupRequired() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[440px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {copy.setup.title}
        </h1>

        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">
          {copy.setup.body}
        </p>

        <ul className="mt-4 flex flex-col gap-1">
          {VARS.map((name) => (
            <li
              key={name}
              className="rounded-sm border border-border px-2.5 py-1.5 font-mono text-[12px] text-fg-muted"
            >
              {name}
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[13px] leading-relaxed text-fg-faint">
          {copy.setup.rebuild}
        </p>

        <p className="mt-4 text-[12px] text-fg-faint">
          <a href="/api/health" className="underline underline-offset-2">
            {copy.setup.check}
          </a>
        </p>
      </div>
    </main>
  );
}
