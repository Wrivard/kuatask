"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";

/*
  Both are dialogs: nothing renders until they open, and cmdk plus its dialog
  tree is a meaningful share of the first load otherwise. Loading them on demand
  keeps the palette off the critical path of a list you look at fifty times a day
  and open ⌘K on far less often.
*/
const CommandPalette = dynamic(
  () => import("./command-palette").then((m) => m.CommandPalette),
  { ssr: false },
);
const ShortcutSheet = dynamic(
  () => import("./shortcut-sheet").then((m) => m.ShortcutSheet),
  { ssr: false },
);
import { useHotkeys, useSequence } from "@/lib/hotkeys";
import { focusComposer, openTask, searchHref, startSearch } from "@/lib/events";
import { useStore } from "@/lib/store";

/** Global keyboard layer plus the two dialogs it opens. */
export function AppChrome() {
  const router = useRouter();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const undo = useStore((s) => s.undo);

  const goToSection = React.useCallback(
    (bucket: string) => {
      router.push("/");
      // let the list mount before jumping to the anchor
      requestAnimationFrame(() => {
        document
          .getElementById(`section-${bucket}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [router],
  );

  useHotkeys({
    "mod+k": () => setPaletteOpen((v) => !v),
    "mod+z": () => undo(),
    escape: () => {
      setPaletteOpen(false);
      setSheetOpen(false);
    },
    c: () => focusComposer(),
    /*
      On the list the composer is right there, so this is just a focus change.
      Anywhere else there is no composer to turn into a search box, and this
      used to dispatch an event that nothing was listening for — `/` on the
      board did nothing whatsoever.
    */
    "/": () => {
      if (pathname === "/") startSearch();
      else router.push(searchHref(""));
    },
    "?": () => setSheetOpen(true),
    "1": () => goToSection("today"),
    "2": () => goToSection("tomorrow"),
    "3": () => goToSection("week"),
    "4": () => goToSection("month"),
  });

  useSequence("g", {
    c: () => router.push("/calendar"),
    b: () => router.push("/board"),
    l: () => router.push("/"),
    a: () => router.push("/activity"),
    // S alone cycles a row's status; behind G there is no collision
    s: () => router.push("/settings"),
    /*
      P for palmarès. C and L — the letters « Classement » actually offers — are
      already the calendar and the list, and a route without a shortcut is the
      one nobody reaches by keyboard. The sheet spells it out, which is what
      makes an imperfect mnemonic workable.
    */
    p: () => router.push("/stats"),
  });

  return (
    <>
      {/* mounting only once opened keeps the import off the first load */}
      {paletteOpen && (
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          onOpenTask={openTask}
          onFocusComposer={focusComposer}
        />
      )}
      {sheetOpen && (
        <ShortcutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      )}
    </>
  );
}
