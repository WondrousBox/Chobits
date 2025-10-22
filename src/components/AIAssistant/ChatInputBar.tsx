import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChatSelection } from './context/ChatSelectionContext';
import ServiceInstanceSelect from '@/components/AIAssistant/ServiceInstanceSelect';
import ChatInput from '@/components/AIAssistant/ChatInput';

export interface ChatInputBarProps {
  // Triggered when user hits send (Enter or button)
  onStart: (params: {
    content: string;
    providerId: string;
    instanceId: string;
    agentId: string;
  }) => void | Promise<void>;
  // Triggered when user clicks stop
  onStop?: () => void;
  // Loading indicates a streaming/processing state
  loading?: boolean;
  // Optional placeholder override
  placeholder?: string;
  // Optional className to wrap the whole input bar container
  className?: string;
}

export default function ChatInputBar({ onStart, onStop, loading, placeholder, className }: ChatInputBarProps) {
  // consume shared provider/instance/agent state
  const { agents, providerId, instanceId, agentId, setProviderId, setInstanceId, setAgentId, getOrderedInstances } = useChatSelection();
  
  useEffect(() => {
    // ensure instance selection exists when starting
  }, [instanceId]);

  return (
    <ChatInput
      onStart={async (content) => {
        if (!instanceId) return; // require instance for chat mode
        await onStart?.({ content, providerId, instanceId, agentId });
      }}
      onStop={onStop}
      loading={loading}
      placeholder={placeholder}
      className={className}
      footerLeft={(
        <>
          <div className="shrink-0 no-drag">
            <ServiceInstanceSelect
              providerId={providerId}
              instanceId={instanceId}
              onChange={(pid, iid) => { setProviderId(pid); setInstanceId(iid); }}
              buttonVariant="outline"
              buttonSize="sm"
              orderInstances={(list, pid) => (getOrderedInstances ? getOrderedInstances(pid) : list)}
            />
          </div>
          <div className="shrink-0 no-drag">
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-8 rounded-full text-xs text-muted-foreground">
                <SelectValue placeholder="选择 Agent" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    />
  );
}
