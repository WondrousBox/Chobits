import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TbLoader2, TbSend } from 'react-icons/tb';
import { useChatSelection } from './context/ChatSelectionContext';
import ServiceInstanceSelect from '@/components/common/ServiceInstanceSelect';

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
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  

  // consume shared provider/instance/agent state
  const { agents, providerId, instanceId, agentId, setProviderId, setInstanceId, setAgentId, getOrderedInstances } = useChatSelection();

  // Textarea auto height
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 200;
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
    // Toggle scrollbar only when overflowing the max height
    const isOverflowing = el.scrollHeight > maxH;
    setShowScrollbar(isOverflowing);
    // If user is typing at the end and content overflows, keep scroll pinned to bottom
    const isFocused = document.activeElement === el;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (isOverflowing && isFocused && atEnd) {
      el.scrollTop = el.scrollHeight;
    }
  }, [input]);

  const [showScrollbar, setShowScrollbar] = useState(false);

  const doStart = async () => {
    const content = input.trim();
    if (!content || !instanceId) return;
    try {
      await onStart?.({ content, providerId, instanceId, agentId });
      setInput('');
    } catch { /* surface errors in parent if needed */ }
  };

  const doStop = () => {
    onStop?.();
  };

  // moved provider/instance selector UI into reusable component

  return (
    <div className={`relative box-border my-2 mx-2 max-w-[800px] w-[calc(100%-1rem)] ${className || ''}`}>
      <Textarea
        ref={textareaRef}
        rows={1}
        className={clsx(
          'resize-none min-h-0 max-h-52 pr-24 pb-16 box-border rounded-2xl text-muted-foreground bg-muted',
          showScrollbar ? 'overflow-y-auto' : 'overflow-y-hidden'
        )}
        value={input}
        onChange={e => setInput(e.target.value)}
        placeholder={placeholder ?? '输入消息'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!loading && instanceId) doStart();
          }
        }}
      />

      {/* Send / Stop */}
      {!loading ? (
        <Button
          onClick={doStart}
          size="icon"
          disabled={!input.trim() || !instanceId}
          className="absolute bottom-2 right-2 rounded-full"
          aria-label="发送"
        >
          <TbSend className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          onClick={doStop}
          size="icon"
          variant={"destructive"}
          className="absolute bottom-2 right-2 rounded-full"
          aria-label="停止"
        >
          <TbLoader2 className="h-4 w-4 animate-spin" />
        </Button>
      )}

      {/* Bottom toolbar: provider/instance selector + agent selector */}
      <div className="absolute bottom-2 left-2 right-16 flex items-center gap-1 overflow-x-auto">
        <div className="shrink-0">
          <ServiceInstanceSelect
            providerId={providerId}
            instanceId={instanceId}
            onChange={(pid, iid) => { setProviderId(pid); setInstanceId(iid) }}
            buttonVariant="outline"
            buttonSize="sm"
            orderInstances={(list, pid) => (getOrderedInstances ? getOrderedInstances(pid) : list)}
          />
        </div>
        <div className="shrink-0">
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

        <div className="shrink-0 text-xs text-muted-foreground">
          Enter 发送、Shift+Enter 换行
        </div>
      </div>
    </div>
  );
}
