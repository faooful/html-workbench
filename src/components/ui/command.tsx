import * as React from "react"

import { cn } from "../../lib/utils"

function Command({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command"
      className={cn("flex h-full w-full flex-col overflow-hidden rounded-xl bg-[var(--surface-popover)] text-[var(--text-primary)]", className)}
      {...props}
    />
  )
}

function CommandInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="command-input"
      className={cn(
        "h-12 w-full border-0 border-b border-[var(--border)] bg-transparent px-4 text-sm outline-none placeholder:text-[var(--text-faint)]",
        className,
      )}
      {...props}
    />
  )
}

function CommandList({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="command-list" className={cn("min-h-0 flex-1 overflow-y-auto p-2", className)} {...props} />
}

function CommandEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="command-empty" className={cn("px-4 py-10 text-center text-sm text-[var(--text-muted)]", className)} {...props} />
}

function CommandGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="command-group" className={cn("grid gap-1 py-1", className)} {...props} />
}

function CommandGroupHeading({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-group-heading"
      className={cn("px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--text-faint)]", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  active = false,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type={type}
      data-slot="command-item"
      data-active={active}
      className={cn(
        "grid min-h-11 w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 text-left outline-none transition-colors",
        "hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]",
        "data-[active=true]:bg-[var(--surface-hover)]",
        className,
      )}
      {...props}
    />
  )
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn("rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-faint)]", className)}
      {...props}
    />
  )
}

export {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandGroupHeading,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
}
