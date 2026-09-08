import { Header } from "@/components/shell/header";
import { copy } from "@/lib/copy";

/**
 * The list view is the default route. Phase 2 fills this with the composer,
 * the six sections and the completion sequence.
 */
export default function ListPage() {
  return (
    <>
      <Header title={copy.nav.today} />
      <div className="max-w-[760px] px-6 py-6" />
    </>
  );
}
