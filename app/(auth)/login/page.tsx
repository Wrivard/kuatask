"use client";

import * as React from "react";
import { createClient } from "@/lib/supabase/client";
import { hasSeenApp } from "@/lib/seen";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const RESEND_SECONDS = 30;

/**
 * Magic link only. Seen roughly once a month, so it stays plain: one field,
 * one button, no logo lockup, no marketing copy, no illustration.
 */
export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [returning, setReturning] = React.useState(false);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  /*
    Two ways to arrive here with something to say. /auth/callback bounces an
    expired or reused link back, and the middleware sends you back when a
    session it was holding stops refreshing — which otherwise looks exactly like
    never having been signed in: you are simply somewhere else, with no idea why.
  */
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "expired") setError(copy.error.linkExpired);
    else if (params.get("expired") === "1") setError(copy.error.sessionExpired);
    else {
      /*
        Neither flag. The middleware only knows about a cookie that is still
        present but invalid — one the browser has already discarded leaves no
        trace, so a returning person gets a screen identical to a stranger's and
        no reason to think anything is wrong. This browser having used the app
        before is the only evidence left, and it is enough to say so.
      */
      setReturning(hasSeenApp());
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function send(address: string) {
    setSending(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    });

    setSending(false);

    if (error) {
      /*
        « Vérifie l'adresse » is the wrong thing to say when the address is
        fine and the database is asleep.

        This project is on Supabase's free plan, which pauses a project after a
        week without activity — a realistic Monday for two people who did not
        touch it over a long weekend. The person would retype their address,
        try again, and never learn that what is needed is a click in a dashboard
        they were not thinking about.

        Asked rather than inferred: /api/health already reaches the database
        with the same key the app uses, so it can answer definitively instead of
        this guessing from the shape of an auth error. One extra request, only
        ever on the failure path.
      */
      setError((await databaseIsDown()) ? copy.error.serviceDown : copy.error.loginFailed);
      return;
    }

    setSentTo(address);
    setCooldown(RESEND_SECONDS);
  }

  /**
   * True when the probe says the database did not answer.
   *
   * Any doubt resolves to false: a probe that itself fails to load proves
   * nothing, and claiming the database is down when it might not be sends
   * somebody to a dashboard for no reason.
   */
  async function databaseIsDown(): Promise<boolean> {
    try {
      const health = await fetch("/api/health", { cache: "no-store" });
      const body = await health.json();
      return body?.configured === true && body?.database?.ok === false;
    } catch {
      return false;
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    void send(address);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-[320px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">
          {copy.auth.title}
        </h1>

        {returning && sentTo === null && (
          <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">
            {copy.auth.returning}
          </p>
        )}

        {sentTo === null ? (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
            <Input
              type="email"
              name="email"
              autoComplete="email"
              autoFocus
              required
              placeholder={copy.auth.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-sm text-[15px]"
            />
            <Button
              type="submit"
              disabled={sending || email.trim() === ""}
              className="h-10 rounded-sm text-[14px] font-medium"
            >
              {sending ? copy.auth.sending : copy.auth.send}
            </Button>
          </form>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            <p className="text-[13px] leading-relaxed text-fg-muted">
              {copy.auth.sent(sentTo)}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={cooldown > 0 || sending}
              onClick={() => void send(sentTo)}
              className="h-10 rounded-sm text-[14px] font-medium"
            >
              {cooldown > 0 ? copy.auth.resendIn(cooldown) : copy.auth.resend}
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
