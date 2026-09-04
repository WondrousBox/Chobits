import type * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { TbChevronDown } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ChatAgentSelectOption {
  id: string;
  label: string;
}

export interface ChatAgentSelectProps {
  agents: ChatAgentSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  prefix?: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOpenPrepare?: () => void;
  contentSide?: DropdownMenuPrimitive.DropdownMenuContentProps['side'];
  contentAlign?: DropdownMenuPrimitive.DropdownMenuContentProps['align'];
  avoidCollisions?: DropdownMenuPrimitive.DropdownMenuContentProps['avoidCollisions'];
}

export default function ChatAgentSelect({
  agents,
  value,
  onValueChange,
  placeholder = '选择模式',
  prefix,
  triggerClassName,
  contentClassName,
  disabled = false,
  onOpenChange,
  onOpenPrepare,
  contentSide,
  contentAlign = 'start',
  avoidCollisions
}: ChatAgentSelectProps): JSX.Element {
  const selectedAgent = agents.find((agent) => agent.id === value);
  const label = selectedAgent?.label || placeholder;

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn('h-8 max-w-32 justify-between gap-1 rounded-full border-0 text-xs text-muted-foreground shadow-none', triggerClassName)}
          onPointerDown={() => onOpenPrepare?.()}
        >
          {prefix ? <span className="shrink-0">{prefix}</span> : null}
          <span className="min-w-0 truncate">{label}</span>
          <TbChevronDown className="shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={contentAlign} side={contentSide} avoidCollisions={avoidCollisions} className={cn('no-drag pointer-events-auto min-w-[8rem] text-xs', contentClassName)}>
        {agents.map((agent) => (
          <DropdownMenuItem key={agent.id} onSelect={() => onValueChange(agent.id)}>
            {agent.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
