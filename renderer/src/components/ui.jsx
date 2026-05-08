import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
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
        className={cn('fixed left-1/2 top-[8vh] z-50 grid w-[min(420px,calc(100vw-40px))] -translate-x-1/2 gap-4 rounded-lg border border-border bg-panel p-4 shadow-soft focus:outline-none', className)}
        {...props}
      />
    </DialogPrimitive.Portal>
  )
}

export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description

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
