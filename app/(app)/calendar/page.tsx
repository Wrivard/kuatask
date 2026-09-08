import { Header } from "@/components/shell/header";
import { CalendarView } from "@/components/views/calendar-view";
import { copy } from "@/lib/copy";

export default function CalendarPage() {
  return (
    <>
      <Header title={copy.nav.calendar} />
      <CalendarView />
    </>
  );
}
