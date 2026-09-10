"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { focusComposer, openTask, startSearch } from "@/lib/events";
import { useStore } from "@/lib/store";

/** Global keyboard layer plus the two dialogs it opens. */
export function AppChrome() {
  const router = useRouter();
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
    "/": () => startSearch(),
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
    // S alone cycles a row's status; behind G there is no collision
    s: () => router.push("/settings"),
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
