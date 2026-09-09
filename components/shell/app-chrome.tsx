"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CommandPalette } from "./command-palette";
import { ShortcutSheet } from "./shortcut-sheet";
import { useHotkeys, useSequence } from "@/lib/hotkeys";
import { focusComposer, openTask } from "@/lib/events";
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
    "/": () => focusComposer(),
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
  });

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenTask={openTask}
        onFocusComposer={focusComposer}
      />
      <ShortcutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
