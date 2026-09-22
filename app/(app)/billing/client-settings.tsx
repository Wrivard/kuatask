"use client";

import * as React from "react";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber, parseAmount } from "@/lib/billing";
import { normalize } from "@/lib/search";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { Client } from "./data";
import { FIELD, PANEL, SECONDARY } from "./ui";

/**
 * A client's name, rate and fate, in the same two fields as creating one.
 *
 * Each field saves when you leave it or press Enter, and says so: the panel
 * used to save silently, which on a form reads as "nothing happened" and gets
 * the field retyped. Escape puts the field back as it was.
 */
export function ClientSettings({
  client,
  clients,
  archived,
  deletable,
  onPatch,
  onDelete,
  onClose,
}: {
  client: Client;
  clients: Client[];
  archived: boolean;
  deletable: boolean;
  /** Resolves true when the server took it. */
  onPatch: (patch: Partial<Client>) => Promise<boolean>;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(client.name);
  const [rate, setRate] = React.useState(formatNumber(client.default_rate));
  const [saved, setSaved] = React.useState<"name" | "rate" | "status" | null>(null);

  // someone else renamed it, or the rate changed from the other screen
  React.useEffect(() => setName(client.name), [client.name]);
  React.useEffect(() => setRate(formatNumber(client.default_rate)), [client.default_rate]);

  React.useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(null), 1800);
    return () => clearTimeout(t);
  }, [saved]);

  const trimmed = name.trim();
  const taken =
    trimmed !== "" &&
    clients.some((c) => c.id !== client.id && normalize(c.name) === normalize(trimmed));

  async function saveName() {
    if (trimmed === client.name) return;
    if (trimmed === "" || taken) {
      if (taken) toast.error(copy.billing.nameTaken);
      setName(client.name);
      return;
    }
    if (await onPatch({ name: trimmed })) setSaved("name");
  }

  async function saveRate() {
    const n = parseAmount(rate);
    if (typeof n !== "number") {
      if (n === undefined) toast.error(copy.billing.invalidNumber);
      setRate(formatNumber(client.default_rate));
      return;
    }
    setRate(formatNumber(n));
    if (n === client.default_rate) return;
    if (await onPatch({ default_rate: n })) setSaved("rate");
  }

  const keys =
    (save: () => void, revert: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        revert();
        e.currentTarget.blur();
      }
    };

  return (
    <section className={cn(PANEL, "mb-5")} aria-label={copy.billing.settings}>
      <div className="flex flex-wrap items-start gap-3">
        <label className="flex min-w-[220px] max-w-[360px] flex-1 flex-col gap-1.5">
          <span className={cn(MICRO_LABEL, "flex items-center gap-1.5")}>
            {copy.billing.rename}
            <Saved on={saved === "name"} />
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={keys(saveName, () => setName(client.name))}
            maxLength={120}
            aria-invalid={taken ? true : undefined}
            className={FIELD}
          />
          {taken && <span className="text-[12px] text-danger">{copy.billing.nameTaken}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={cn(MICRO_LABEL, "flex items-center gap-1.5")}>
            {copy.billing.rate}
            <Saved on={saved === "rate"} />
          </span>
          <span className="flex items-center gap-1.5">
            <input
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              onBlur={saveRate}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={keys(saveRate, () => setRate(formatNumber(client.default_rate)))}
              inputMode="decimal"
              className={cn(FIELD, "w-20 text-right tabular-nums")}
            />
            <span className="text-[13px] text-fg-muted">{copy.billing.rateSuffix}</span>
          </span>
        </label>

        {/*
          A status you choose rather than an action you take. « Archiver le
          client » was a button, so nothing on the page ever said a client was
          active — a new one looked like it had no state at all, and the button
          read as though archiving were what it currently was.
        */}
        <label className="flex flex-col gap-1.5">
          <span className={cn(MICRO_LABEL, "flex items-center gap-1.5")}>
            {copy.billing.statusLabel}
            <Saved on={saved === "status"} />
          </span>
          <span className="relative block">
            <select
              value={archived ? "archived" : "active"}
              onChange={async (e) => {
                const next = e.target.value === "archived" ? new Date().toISOString() : null;
                if (await onPatch({ archived_at: next })) setSaved("status");
              }}
              className={cn(FIELD, "w-36 cursor-pointer appearance-none pl-7 pr-8")}
            >
              <option value="active">{copy.billing.clientStatus.active}</option>
              <option value="archived">{copy.billing.clientStatus.archived}</option>
            </select>
            <span
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 size-2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: archived ? "var(--color-fg-faint)" : "var(--color-accent)" }}
            />
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-muted"
              strokeWidth={1.5}
            />
          </span>
        </label>
      </div>

      <p className="mt-2 text-[12px] text-fg-faint">{copy.billing.rateHint}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <p className="text-[12px] text-fg-faint">{copy.billing.statusHint}</p>

        {deletable && (
          <button
            type="button"
            onClick={onDelete}
            className={cn(SECONDARY, "hover:border-danger hover:text-danger")}
          >
            <Trash2 className="size-4" strokeWidth={1.5} aria-hidden />
            {copy.billing.deleteClientShort}
          </button>
        )}

        <button type="button" onClick={onClose} className={cn(SECONDARY, "ml-auto")}>
          {copy.billing.close}
        </button>
      </div>
    </section>
  );
}

function Saved({ on }: { on: boolean }) {
  return (
    <span
      aria-live="polite"
      className={cn(
        "flex items-center gap-0.5 normal-case tracking-normal text-accent transition-opacity duration-300",
        on ? "opacity-100" : "opacity-0",
      )}
    >
      {on && (
        <>
          <Check className="size-3" strokeWidth={2.5} aria-hidden />
          {copy.billing.saved}
        </>
      )}
    </span>
  );
}
