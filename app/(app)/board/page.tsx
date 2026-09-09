import { Header } from "@/components/shell/header";
import { BoardView } from "@/components/views/board-view";
import { copy } from "@/lib/copy";

export default function BoardPage() {
  return (
    <>
      <Header title={copy.nav.board} />
      <BoardView />
    </>
  );
}
