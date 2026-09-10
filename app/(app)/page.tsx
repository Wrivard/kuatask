import { Header } from "@/components/shell/header";
import { ListView } from "@/components/views/list-view";
import { copy } from "@/lib/copy";

/** The list view is the default route. */
export default function ListPage() {
  return (
    <>
      <Header title={copy.nav.list} />
      <ListView />
    </>
  );
}
