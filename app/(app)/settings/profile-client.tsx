"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ACCENTS } from "@/components/task/assignee-dot";
import { useStore } from "@/lib/store";
import { completionTone } from "@/lib/sound";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";

/**
 * Your own settings. Everything writes optimistically to profiles, so the
 * preference follows you to your phone rather than living in this browser.
 *
 * The theme is the exception: it is a per-device preference written to the same
 * localStorage key the boot script reads, so a dark laptop and a light phone
 * stay independent.
 */
export function ProfileClient() {
  const me = useStore((s) => s.me);
  const members = useStore((s) => s.members);
  const updateProfile = useStore((s) => s.updateProfile);
  const setSoundEnabled = useStore((s) => s.setSoundEnabled);

  const [name, setName] = React.useState("");
  const [theme, setTheme] = React.useState<"light" | "dark">("dark");

  React.useEffect(() => {
    if (me) setName(me.display_name);
  }, [me?.display_name]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function chooseTheme(next: "light" | "dark") {
    setTheme(next);
    const root = document.documentElement;
    root.classList.toggle("light", next === "light");
    root.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("kua-theme", next);
    } catch {
      /* blocked storage — the theme just will not persist */
    }
  }

  if (!me) return <div className="px-6 py-6" />;

  // colours already taken by the other person, so the dots stay tellable apart
  const taken = new Set(members.filter((m) => m.id !== me.id).map((m) => m.accent));

  return (
    <div className="max-w-[520px] px-6 py-6">
      <Field label={copy.settings.displayName}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (next && next !== me.display_name) updateProfile({ display_name: next });
            else setName(me.display_name);
          }}
          className="h-9 max-w-[280px] rounded-sm text-[14px]"
        />
        <p className="mt-1.5 text-[12px] text-fg-faint">{copy.settings.displayNameHint}</p>
      </Field>

      <Field label={copy.settings.accent}>
        <div className="flex flex-wrap gap-2">
          {Object.entries(ACCENTS).map(([key, hex]) => {
            const isMine = me.accent === key;
            const isTaken = taken.has(key);
            return (
              <button
                key={key}
                type="button"
                disabled={isTaken}
                onClick={() => updateProfile({ accent: key })}
                aria-label={key}
                aria-pressed={isMine}
                title={isTaken ? copy.settings.accentTaken : key}
                className={cn(
                  "grid size-7 place-items-center rounded-sm border",
                  isMine ? "border-accent" : "border-border",
                  isTaken && "cursor-not-allowed opacity-30",
                )}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: hex }}
                />
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={copy.settings.sound}>
        <div className="flex items-center gap-3">
          <Switch
            checked={me.sound_enabled}
            onCheckedChange={(v) => {
              setSoundEnabled(v);
              // turning it on should prove it works, at the real volume
              if (v) completionTone();
            }}
          />
          <span className="text-[13px] text-fg-muted">
            {me.sound_enabled ? copy.settings.soundOn : copy.settings.soundOff}
          </span>
        </div>
      </Field>

      <Field label={copy.settings.theme}>
        <div className="flex gap-1.5">
          {(["dark", "light"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseTheme(option)}
              className={cn(
                "rounded-sm border px-2 py-1 text-[12px]",
                theme === option
                  ? "border-accent text-fg"
                  : "border-border text-fg-muted hover:text-fg",
              )}
            >
              {option === "dark" ? copy.settings.themeDark : copy.settings.themeLight}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-fg-faint">{copy.settings.themeHint}</p>
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-[13px] font-medium text-fg-muted">{label}</h2>
      {children}
    </section>
  );
}
