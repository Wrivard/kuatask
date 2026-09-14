import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        /*
          shadcn ships this with its own design system, and three parts of it
          disagreed with `docs/04`:

            rounded-lg    10px — the *modal's* radius, on an input. The doc
                          gives 6px to inputs and buttons.
            border-input  and `dark:bg-input/30`, neither of which is one of
                          this app's tokens. DECISIONS gives interactive
                          boundaries `--color-control` at 3:1; the translucent
                          fill is the grey box that had to be patched out of the
                          modal's textareas once already.
            ring-3        a 3px ring in shadcn's ring colour, on top of the 1px
                          accent outline `globals.css` already gives every
                          focusable element. Inputs were the one control in the
                          app with two focus rings, neither of them the
                          specified one.

          Call sites were each patching a different subset of that, which is why
          two fields in the same settings form did not match. Fixed here so they
          cannot drift again; call sites now set only their height and width.
        */
        "h-8 w-full min-w-0 rounded-sm border border-control bg-bg px-2.5 py-1 text-[13px] transition-colors outline-none",
        "placeholder:text-fg-faint focus-visible:border-accent",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
