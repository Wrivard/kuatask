"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DEFAULT_RATE, parseAmount } from "@/lib/billing";
import { normalize } from "@/lib/search";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { Client } from "./data";
import { FIELD, PANEL, PRIMARY, SECONDARY } from "./ui";

/**
 * A new client: its name and its rate, asked for together.
 *
 * Creating one used to be typing a name into the search box and clicking a
 * dashed row that appeared above the results. It was invisible until you knew
 * it was there, it offered itself even while a client with nearly that name was
 * listed just below — the easiest way to make a second « Boulangerie Saint »
 * beside « Boulangerie Saint-Roch » — and it set the rate to 75 without saying
 * so, leaving it to be found later behind the client's settings.
 *
 * Here the rate is on screen before the client exists, a name already in use is
 * caught as you type with a link to the one that exists, and Escape closes it.
 */
export function NewClientForm({
  clients,
  initialName = "",
  onCreate,
  onCancel,
}: {
  clients: Client[];
  initialName?: string;
  onCreate: (name: string, rate: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initialName);
  const [rate, setRate] = React.useState(String(DEFAULT_RATE));

  const trimmed = name.trim();
  const taken = trimmed ? clients.find((c) => normalize(c.name) === normalize(trimmed)) : undefined;
  const parsedRate = parseAmount(rate);
  const rateOk = typeof parsedRate === "number";
  const ready = trimmed !== "" && !taken && rateOk;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (ready) onCreate(trimmed, parsedRate);
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className={cn(PANEL, "mb-4")}
      aria-label={copy.billing.newClient}
    >
      <p className="mb-3 text-[14px] font-medium text-fg">{copy.billing.newClient}</p>

      <div className="flex flex-wrap items-start gap-3">
        <label className="flex min-w-[220px] max-w-[360px] flex-1 flex-col gap-1.5">
          <span className={MICRO_LABEL}>{copy.billing.rename}</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder={copy.billing.namePlaceholder}
            aria-invalid={taken ? true : undefined}
            className={FIELD}
          />
          {taken && (
            <span className="flex items-center gap-1 text-[12px] text-danger">
              {copy.billing.nameTaken}
              <Link
                href={`/billing/${taken.id}`}
                className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2"
              >
                {copy.billing.openExisting(taken.name)}
                <ArrowUpRight className="size-3" strokeWidth={2} aria-hidden />
              </Link>
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={MICRO_LABEL}>{copy.billing.rate}</span>
          <span className="flex items-center gap-1.5">
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              inputMode="decimal"
              aria-invalid={!rateOk ? true : undefined}
              className={cn(FIELD, "w-20 text-right tabular-nums")}
            />
            <span className="text-[13px] text-fg-muted">{copy.billing.rateSuffix}</span>
          </span>
        </label>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className={SECONDARY}>
          {copy.billing.cancel}
        </button>
        <button type="submit" disabled={!ready} className={PRIMARY}>
          {copy.billing.create}
        </button>
      </div>
    </form>
  );
}
