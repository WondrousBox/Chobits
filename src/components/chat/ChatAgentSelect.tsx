import type { ReactNode } from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
}

export default function ChatAgentSelect({ agents, value, onValueChange, placeholder = '选择模式', prefix, triggerClassName, contentClassName, disabled = false }: ChatAgentSelectProps): JSX.Element {
  return (
    <Select disabled={disabled} value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn('h-8 max-w-32 rounded-full text-xs text-muted-foreground', prefix ? 'gap-1' : undefined, triggerClassName)}>
        {prefix ? <span className="shrink-0">{prefix}</span> : null}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={cn('text-xs', contentClassName)}>
        {agents.map((agent) => (
          <SelectItem key={agent.id} value={agent.id}>
            {agent.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
