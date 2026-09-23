import { Header } from "@/components/shell/header";
import { Unreachable } from "@/components/shell/unreachable";
import { copy } from "@/lib/copy";
import { ProductsClient } from "./products-client";
import { PRODUCT_COLUMNS, toProduct, type Product } from "../data";
import { billingContext } from "../context";

export const dynamic = "force-dynamic";

/**
 * The price list: the services sold often enough to be worth not retyping.
 *
 * Prices are before tax, like every amount in this app.
 */
export default async function ProductsPage() {
  const { supabase, workspaceId } = await billingContext();

  const { data, error } = await supabase
    .from("billing_products")
    .select(PRODUCT_COLUMNS)
    .order("name");

  if (error) return <Unreachable code={error.code ?? null} />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Header title={copy.billing.tabProducts} search={false} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ProductsClient
          initial={(data ?? []).map((row) => toProduct(row)) as Product[]}
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}
