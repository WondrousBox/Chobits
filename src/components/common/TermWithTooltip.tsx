import * as React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export type TermWithTooltipProps = {
  /** The inline text or node to display as the term */
  label: React.ReactNode;
  /** Explanation content shown inside the tooltip */
  description: React.ReactNode;
  /** Tailwind classes to customize the label appearance */
  className?: string;
  /** Tooltip side position relative to the trigger */
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Tooltip alignment on the chosen side */
  align?: 'start' | 'center' | 'end';
};

/**
 * Inline term with an explanatory tooltip on hover/focus.
 * Built on shadcn/radix Tooltip. Safe to use inside sentences.
 */
const TermWithTooltip: React.FC<TermWithTooltipProps> = ({ label, description, className, side = 'top', align = 'center' }) => {
  // If no description provided, render plain content without tooltip.
  if (!description) {
    return <span className={cn('inline cursor-help', className)}>{label}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            // visually distinct but subtle inline style
            'inline cursor-help no-drag underline decoration-dotted underline-offset-4 decoration-primary',
            // gradient text effect using theme colors
            'text-transparent bg-clip-text bg-gradient-to-r from-foreground via-primary to-foreground hover:opacity-90',
            className
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-xs break-words text-xs">
        {description}
      </TooltipContent>
    </Tooltip>
  );
};

export default TermWithTooltip;
