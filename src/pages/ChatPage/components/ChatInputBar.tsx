import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useChatSelection } from '../context/ChatSelectionContext';
import ChatInput from './ChatInput';

export interface ChatInputBarProps {
  // Triggered when user hits send (Enter or button)
  onStart: (params: { content: string; providerId: string; presetId: string; agentId: string }) => void | Promise<void>;
  // Triggered when user clicks stop
  onStop?: () => void;
  // Loading indicates a streaming/processing state
  loading?: boolean;
  // Optional placeholder override
  placeholder?: string;
  // Optional className to wrap the whole input bar container
  className?: string;
}

export default function ChatInputBar({ onStart, onStop, loading, placeholder, className }: ChatInputBarProps): JSX.Element {
  // consume shared provider/preset/agent state
  const { agents, providerId, presetId, agentId, setAgentId } = useChatSelection();

  return (
    <ChatInput
      onStart={async (content) => {
        if (!presetId) return; // require preset for chat mode
        await onStart?.({ content, providerId, presetId, agentId });
      }}
      onStop={onStop}
      loading={loading}
      placeholder={placeholder}
      className={className}
      footerLeft={
        <>
          <div className="shrink-0 no-drag">
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger className="h-8 rounded-full text-xs text-muted-foreground">
                <SelectValue placeholder="选择 Agent" />
              </SelectTrigger>
              <SelectContent className="text-xs">
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      }
    />
  );
}
