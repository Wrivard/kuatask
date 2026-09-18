import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        /*
          Same two corrections `Input` and `Button` needed: 6px rather than the
          modal's 10px, and one focus indicator rather than a 3px ring stacked on
          the accent outline `globals.css` already draws.

          `bg-transparent` stays and `dark:bg-input/30` goes. That translucent
          grey is the box the modal's title and notes had to patch out with
          `dark:bg-transparent` at their call sites — the patch can come off now
          that the default is honest.
        */
        "flex field-sizing-content min-h-16 w-full rounded-sm border border-control bg-transparent px-2.5 py-2 text-[13px] transition-colors outline-none placeholder:text-fg-faint focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
