import { ChatAgentSelect } from '@/components/chat';

import { useChatSelection } from '../context/ChatSelectionContext';
import ChatInput from './ChatInput';

export interface ChatInputBarProps {
  // Triggered when user hits send (Enter or button)
  onStart: (params: { content: string; providerId: string; modelId: string; preferredPresetId: string; agentId: string }) => void | Promise<void>;
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
  // consume shared provider/model/hidden-preset/agent state
  const { agents, providerId, modelId, presetId, agentId, setAgentId } = useChatSelection();

  return (
    <ChatInput
      onStart={async (content) => {
        if (!providerId || !modelId) return;
        await onStart?.({ content, providerId, modelId, preferredPresetId: presetId, agentId });
      }}
      onStop={onStop}
      loading={loading}
      placeholder={placeholder}
      className={className}
      footerLeft={
        <div className="shrink-0 no-drag">
          <ChatAgentSelect agents={agents} value={agentId} onValueChange={setAgentId} placeholder="选择 Agent" triggerClassName="h-8 rounded-full text-xs text-muted-foreground" />
        </div>
      }
    />
  );
}
