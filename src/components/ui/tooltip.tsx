import React from 'react'
import { cn } from '@/lib/utils'

export const TooltipProvider: React.FC<{ children: React.ReactNode; delayDuration?: number }> = ({ children }) => <>{children}</>

export const Tooltip: React.FC<{ children: React.ReactNode }> = ({ children }) => <>{children}</>

export const TooltipTrigger: React.FC<{ asChild?: boolean; children: React.ReactElement }> = ({ children }) => children

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: string
  align?: string
  hidden?: boolean
}

export const TooltipContent: React.FC<TooltipContentProps> = ({ className, hidden, side, align, ...props }) => {
  if (hidden) return null
  return <div className={cn('pointer-events-none absolute z-50 rounded bg-popover px-2 py-1 text-xs text-popover-foreground shadow', className)} {...props} />
}
