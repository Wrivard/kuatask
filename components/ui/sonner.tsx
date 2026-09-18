"use client"

import * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Theming here reads the class the inline script in app/layout.tsx puts on
 * <html>, rather than pulling in a theme provider. One source of truth.
 */
function useDocumentTheme(): "light" | "dark" {
  const [theme, setTheme] = React.useState<"light" | "dark">("dark")

  React.useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.classList.contains("light") ? "light" : "dark")
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])

  return theme
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDocumentTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      /*
        A step above `--popover`, with a control's border rather than a hairline.

        The toast used to be `--popover` (#111111) edged with `--border`, which
        is exactly the colour of a board card and a calendar cell — so it floated
        over them at a 1.20:1 edge, which is to say invisibly. That is the undo
        toast: the way back from the action this app is built around.

        `docs/04` bans shadows on everything but the modal, so the separation has
        to come from the ramp instead. One step up lifts it off the surfaces it
        covers, and `--control` at 3.14:1 is the token DECISIONS already assigns
        to the boundary of an interactive control — which a toast carrying an
        « Annuler » button is.
      */
      style={
        {
          "--normal-bg": "var(--surface-hover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--control)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
