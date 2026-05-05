import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'
import { Command as CommandPrimitive } from 'cmdk'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'border-border bg-panel-subtle text-foreground hover:bg-panel-hover',
        ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-panel-hover hover:text-foreground',
        secondary: 'border-border bg-panel-strong text-foreground hover:bg-panel-hover',
        destructive: 'border-destructive bg-destructive text-destructive-foreground hover:opacity-90',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2 text-xs',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
})
Button.displayName = 'Button'

export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none',
        variant === 'success' && 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
        variant === 'warning' && 'border-yellow-500/35 bg-yellow-500/10 text-yellow-300',
        variant === 'error' && 'border-red-500/35 bg-red-500/10 text-red-300',
        variant === 'muted' && 'border-border bg-panel-subtle text-muted-foreground',
        variant === 'default' && 'border-border bg-panel-strong text-foreground',
        className
      )}
      {...props}
    />
  )
}

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close
export function DialogContent({ className, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <DialogPrimitive.Content
        className={cn('fixed left-1/2 top-[16vh] z-50 grid w-[min(420px,calc(100vw-40px))] -translate-x-1/2 gap-4 rounded-lg border border-border bg-panel p-4 shadow-soft focus:outline-none', className)}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

export const AlertDialog = AlertDialogPrimitive.Root
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger
export const AlertDialogCancel = AlertDialogPrimitive.Cancel
export const AlertDialogAction = AlertDialogPrimitive.Action
export function AlertDialogContent({ className, ...props }) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <AlertDialogPrimitive.Content
        className={cn('fixed left-1/2 top-[18vh] z-50 grid w-[min(420px,calc(100vw-40px))] -translate-x-1/2 gap-4 rounded-lg border border-border bg-panel p-4 shadow-soft focus:outline-none', className)}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}
export const AlertDialogTitle = AlertDialogPrimitive.Title
export const AlertDialogDescription = AlertDialogPrimitive.Description
export const AlertDialogFooter = ({ className, ...props }) => <div className={cn('flex justify-end gap-2', className)} {...props} />

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export function DropdownMenuContent({ className, ...props }) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={8}
        align="end"
        className={cn('z-50 min-w-56 overflow-hidden rounded-md border border-border bg-panel p-1 shadow-soft', className)}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}
export const DropdownMenuSeparator = ({ className, ...props }) => <DropdownMenuPrimitive.Separator className={cn('my-1 h-px bg-border', className)} {...props} />
export const DropdownMenuItem = React.forwardRef(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Item ref={ref} className={cn('flex h-8 cursor-default select-none items-center rounded-sm px-2 text-sm outline-none hover:bg-panel-hover focus:bg-panel-hover', className)} {...props} />
))
DropdownMenuItem.displayName = 'DropdownMenuItem'

export const Tabs = TabsPrimitive.Root
export const TabsList = React.forwardRef(({ className, ...props }, ref) => <TabsPrimitive.List ref={ref} className={cn('flex items-center gap-4', className)} {...props} />)
TabsList.displayName = 'TabsList'
export const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger ref={ref} className={cn('h-8 border-b-2 border-transparent px-1 text-sm font-medium text-muted-foreground outline-none hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground', className)} {...props} />
))
TabsTrigger.displayName = 'TabsTrigger'
export const TabsContent = TabsPrimitive.Content

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger
export function TooltipContent({ className, ...props }) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content className={cn('z-50 rounded-md border border-border bg-panel px-2 py-1 text-xs text-foreground shadow-soft', className)} {...props} />
    </TooltipPrimitive.Portal>
  )
}

export const CommandDialog = ({ open, onOpenChange, children }) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
      <DialogPrimitive.Content className="fixed left-1/2 top-[13vh] z-50 w-[min(680px,calc(100vw-42px))] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-panel shadow-soft">
        <CommandPrimitive className="flex h-full w-full flex-col overflow-hidden">{children}</CommandPrimitive>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>
)
export const CommandInput = React.forwardRef((props, ref) => <CommandPrimitive.Input ref={ref} className="h-12 w-full border-b border-border bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground" {...props} />)
CommandInput.displayName = 'CommandInput'
export const CommandList = ({ className, ...props }) => <CommandPrimitive.List className={cn('max-h-[390px] overflow-auto p-2', className)} {...props} />
export const CommandEmpty = CommandPrimitive.Empty
export const CommandGroup = CommandPrimitive.Group
export const CommandItem = React.forwardRef(({ className, ...props }, ref) => <CommandPrimitive.Item ref={ref} className={cn('flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 text-sm data-[selected=true]:bg-panel-hover', className)} {...props} />)
CommandItem.displayName = 'CommandItem'

export function Input({ className, ...props }) {
  return <input className={cn('h-9 rounded-md border border-border bg-input px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring', className)} {...props} />
}

export function Label({ className, ...props }) {
  return <label className={cn('grid gap-1.5 text-xs font-semibold text-muted-foreground', className)} {...props} />
}
