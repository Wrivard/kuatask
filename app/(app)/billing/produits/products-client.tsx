"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatAmount, formatMoney, parseAmount, taxesOn } from "@/lib/billing";
import { MICRO_LABEL } from "@/lib/type";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { BillingTabs } from "../tabs";
import { FIELD, PANEL, PRIMARY, SECONDARY } from "../ui";
import type { Product } from "../data";

/**
 * The price list.
 *
 * « Frais de Création / stratégie », « Forfait Vitrine », « Forfait
 * Croissance » — three services typed out again on every client's sheet, at
 * the same price each time, until one of them is typed at last month's price.
 * Kept here once, picked from a client's sheet, and copied into the line: the
 * line keeps what was agreed that day, so changing a price here never rewrites
 * an invoice already sent.
 *
 * Edited in place like the sheet: each field saves when you leave it.
 */
export function ProductsClient({
  initial,
  workspaceId,
}: {
  initial: Product[];
  workspaceId: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const [products, setProducts] = React.useState(initial);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");

  React.useEffect(() => setProducts(initial), [initial]);

  /*
    Both people price the same services, so a price changed on the other screen
    should not wait for a reload. Coarse on purpose: the list is small and the
    server already knows how to render it.
  */
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`billing-products:${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "billing_products",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          clearTimeout(timer);
          timer = setTimeout(() => router.refresh(), 400);
        },
      )
      .subscribe();

    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, router, workspaceId]);

  function patch(id: string, p: Partial<Product>) {
    const before = products.find((x) => x.id === id);
    if (!before) return;
    setProducts((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

    void (async () => {
      const { error } = await supabase.from("billing_products").update(p).eq("id", id);
      if (error) {
        setProducts((list) => list.map((x) => (x.id === id ? before : x)));
        toast.error(copy.billing.saveFailed);
        return;
      }
      router.refresh();
    })();
  }

  function add() {
    const trimmed = name.trim();
    const parsed = parseAmount(price);
    if (!trimmed || typeof parsed !== "number") {
      if (typeof parsed !== "number" && price.trim() !== "") toast.error(copy.billing.invalidNumber);
      return;
    }

    const product: Product = {
      id: crypto.randomUUID(),
      name: trimmed,
      detail: "",
      price: parsed,
      archived_at: null,
    };
    setProducts((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name, "fr")));
    setName("");
    setPrice("");

    void (async () => {
      const { error } = await supabase
        .from("billing_products")
        .insert({ ...product, workspace_id: workspaceId });
      if (error) {
        setProducts((list) => list.filter((x) => x.id !== product.id));
        toast.error(copy.billing.saveFailed);
        return;
      }
      router.refresh();
    })();
  }

  function remove(product: Product) {
    setProducts((list) => list.filter((x) => x.id !== product.id));

    void (async () => {
      const { error } = await supabase.from("billing_products").delete().eq("id", product.id);
      if (error) {
        setProducts((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name, "fr")));
        toast.error(copy.billing.saveFailed);
        return;
      }
      router.refresh();
      toast(copy.billing.productDeleted(product.name), {
        action: {
          label: copy.toast.undo,
          onClick: () => {
            setProducts((list) => [...list, product].sort((a, b) => a.name.localeCompare(b.name, "fr")));
            void supabase
              .from("billing_products")
              .insert({ ...product, workspace_id: workspaceId })
              .then(({ error: undoError }) => {
                if (undoError) toast.error(copy.billing.saveFailed);
                else router.refresh();
              });
          },
        },
      });
    })();
  }

  return (
    <div className="max-w-[860px] px-6 py-6">
      <BillingTabs />

      <p className="mb-4 max-w-[560px] text-[13px] leading-relaxed text-fg-muted">
        {copy.billing.productsIntro}
      </p>

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAdding(false);
          }}
          className={cn(PANEL, "mb-4")}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[220px] max-w-[360px] flex-1 flex-col gap-1.5">
              <span className={MICRO_LABEL}>{copy.billing.productName}</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder={copy.billing.productPlaceholder}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={MICRO_LABEL}>{copy.billing.productPrice}</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className={cn(FIELD, "w-28 text-right tabular-nums")}
              />
            </label>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => setAdding(false)} className={SECONDARY}>
                {copy.billing.cancel}
              </button>
              <button type="submit" disabled={!name.trim()} className={PRIMARY}>
                {copy.billing.addProduct}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={cn(PRIMARY, "mb-4")}>
          <Plus className="size-4" strokeWidth={2} aria-hidden />
          {copy.billing.addProduct}
        </button>
      )}

      {products.length === 0 ? (
        <p className="rounded-md border border-dashed border-control px-6 py-10 text-center text-[13px] text-fg-muted">
          {copy.billing.noProducts}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[520px] border-collapse text-[14px] [&_tbody_tr:last-child_td]:border-b-0">
            <thead className="bg-surface">
              <tr>
                <th className={cn(MICRO_LABEL, "border-b border-border px-3 py-2.5 text-left font-medium")}>
                  {copy.billing.productName}
                </th>
                <th className={cn(MICRO_LABEL, "hidden border-b border-border px-3 py-2.5 text-left font-medium sm:table-cell")}>
                  {copy.billing.col.detail}
                </th>
                <th className={cn(MICRO_LABEL, "w-[120px] whitespace-nowrap border-b border-border px-3 py-2.5 text-right font-medium")}>
                  {copy.billing.productPrice}
                </th>
                <th className={cn(MICRO_LABEL, "hidden w-[140px] whitespace-nowrap border-b border-border px-3 py-2.5 text-right font-medium sm:table-cell")}>
                  {copy.billing.withTaxes}
                </th>
                <th className="w-[36px] border-b border-border" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="group align-middle hover:bg-surface-hover/50">
                  <td className="border-b border-border px-1 py-1">
                    <Cell
                      value={product.name}
                      onCommit={(v) => v && patch(product.id, { name: v })}
                      label={copy.billing.productName}
                      className="font-medium"
                    />
                  </td>
                  <td className="hidden border-b border-border px-1 py-1 sm:table-cell">
                    <Cell
                      value={product.detail}
                      onCommit={(v) => patch(product.id, { detail: v })}
                      label={copy.billing.col.detail}
                      placeholder={copy.billing.productDetailPlaceholder}
                      className="text-[13px] text-fg-muted"
                    />
                  </td>
                  <td className="border-b border-border px-1 py-1">
                    <Cell
                      value={formatAmount(product.price)}
                      onCommit={(v) => {
                        const parsed = parseAmount(v);
                        if (typeof parsed !== "number") {
                          toast.error(copy.billing.invalidNumber);
                          return;
                        }
                        patch(product.id, { price: parsed });
                      }}
                      label={copy.billing.productPrice}
                      className="text-right tabular-nums"
                    />
                  </td>
                  {/* what the client actually pays, so the number is never done in your head */}
                  <td className="hidden border-b border-border px-3 py-2 text-right text-[13px] tabular-nums text-fg-faint sm:table-cell">
                    {formatMoney(taxesOn(product.price).total)}
                  </td>
                  <td className="border-b border-border px-1 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => remove(product)}
                      title={copy.billing.deleteProduct}
                      aria-label={copy.billing.deleteProduct}
                      className={cn(
                        "grid size-6 place-items-center rounded-sm text-fg-faint",
                        "opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100",
                        "[@media(pointer:coarse)]:size-9 [@media(pointer:coarse)]:opacity-100",
                      )}
                    >
                      <X className="size-4" strokeWidth={1.5} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A cell that is text until you click it, then a field that saves on leaving. */
function Cell({
  value,
  onCommit,
  label,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const editing = React.useRef(false);
  React.useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  return (
    <input
      value={draft}
      aria-label={label}
      placeholder={placeholder}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        const next = draft.trim();
        if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          editing.current = false;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "w-full rounded-sm bg-transparent px-2 py-1.5 text-[14px] text-fg",
        "placeholder:text-fg-faint focus-visible:bg-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
        className,
      )}
    />
  );
}
