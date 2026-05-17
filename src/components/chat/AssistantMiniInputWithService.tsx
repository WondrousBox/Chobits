import { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbSend } from 'react-icons/tb';
import { toast } from 'sonner';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import type { ChatInputWithServiceProps } from './ChatInputWithService';
import SpeechInputButton from './SpeechInputButton';
import { mergeTranscriptWithInput, useSpeechInput } from './useSpeechInput';

export interface AssistantMiniInputWithServiceProps {
  onStart: ChatInputWithServiceProps['onStart'];
  loading?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  onMenuOpenChange?: (open: boolean) => void;
  onMenuOpenPrepare?: () => void;
}

export default function AssistantMiniInputWithService({
  onStart,
  loading = false,
  disabled = false,
  autoFocus = false,
  placeholder = '问点什么...',
  className,
  onMenuOpenChange,
  onMenuOpenPrepare
}: AssistantMiniInputWithServiceProps): JSX.Element {
  const { providerId, modelId, presetId, agentId, codingWorkspaceRoot, codingWorkspaceLabel, webSearchEnabled, emojiPacksEnabled, characterPersonaEnabled, setProviderId, setModelId } =
    useChatSelection();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isCoder = agentId === 'coder';
  const hasContent = draft.trim().length > 0;

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  const handleTranscriptFinal = useCallback((text: string): void => {
    setDraft((current) => mergeTranscriptWithInput(current, text));
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const speechInput = useSpeechInput({
    onTranscriptFinal: handleTranscriptFinal
  });

  const handleSend = useCallback(async (): Promise<void> => {
    const content = draft.trim();
    if (disabled || loading || !content || !providerId || !modelId) return;

    if (isCoder && !codingWorkspaceRoot) {
      toast.error('代码助手需要先选择项目目录');
      return;
    }

    await onStart({
      content,
      providerId,
      modelId,
      preferredPresetId: presetId || undefined,
      agentId,
      webSearchEnabled,
      characterPersonaEnabled,
      emojiPacksEnabled,
      ...(isCoder && codingWorkspaceRoot
        ? {
          codingWorkspaceRoot,
          codingWorkspaceLabel: codingWorkspaceLabel || undefined
        }
        : {})
    });
    setDraft('');
  }, [agentId, characterPersonaEnabled, codingWorkspaceLabel, codingWorkspaceRoot, disabled, draft, emojiPacksEnabled, isCoder, loading, modelId, onStart, presetId, providerId, webSearchEnabled]);

  return (
    <div className={cn('no-drag pointer-events-auto m-1 flex h-12 w-[calc(100%-0.5rem)] items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg backdrop-blur box-border', className)}>
      <ProviderModelSelect
        providerId={providerId}
        presetId={presetId || undefined}
        modelId={modelId || undefined}
        onChange={(pid, nextModelId) => {
          setProviderId(pid);
          setModelId(nextModelId);
        }}
        buttonVariant="ghost"
        buttonSize="sm"
        triggerMode="icon"
        placeholder="选择模型"
        autoLoadFirst
        modelTypes={['chat']}
        className="h-8 w-8 shrink-0 rounded-full"
        onOpenChange={onMenuOpenChange}
        onOpenPrepare={onMenuOpenPrepare}
        menuSide="bottom"
        menuAlign="start"
        subMenuSide="right"
        avoidCollisions={false}
      />

      <Input
        ref={inputRef}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        className="h-9 min-w-0 flex-1 border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void handleSend();
          }
          if (event.key === 'Escape') {
            inputRef.current?.blur();
          }
        }}
      />

      <SpeechInputButton
        disabled={disabled}
        interimText={speechInput.interimText}
        isBusy={speechInput.isBusy}
        isListening={speechInput.isListening}
        onToggle={speechInput.toggle}
        buttonVariant="ghost"
        className="h-8 w-8 shrink-0"
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" className="h-8 w-8 shrink-0 rounded-full" disabled={disabled || loading || !hasContent} aria-label="发送" onClick={() => void handleSend()}>
            {loading ? <TbLoader2 className="animate-spin" /> : <TbSend />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{loading ? '正在打开对话' : '发送消息'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
