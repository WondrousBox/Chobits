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
  isLoading?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  onMenuOpenChange?: (open: boolean) => void;
  onMenuOpenPrepare?: () => void;
}

export default function AssistantMiniInputWithService({
  onStart,
  isLoading = false,
  disabled = false,
  autoFocus = false,
  placeholder = '问点什么...',
  className,
  onMenuOpenChange,
  onMenuOpenPrepare
}: AssistantMiniInputWithServiceProps): JSX.Element {
  const { providerId, modelId, presetId, agentId, codingWorkspaceRoot, codingWorkspaceLabel, webSearchEnabled, characterPromptEnabled, setProviderId, setModelId } = useChatSelection();
  const [draft, setDraft] = useState('');
  // 语音识别中的临时文字（仅展示，未写入草稿）
  const [speechInterim, setSpeechInterim] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isCoder = agentId === 'coder';
  // 输入框显示值 = 已确定草稿 + 识别中的临时文字
  const displayValue = speechInterim ? mergeTranscriptWithInput(draft, speechInterim) : draft;
  const hasContent = displayValue.trim().length > 0;

  useEffect(() => {
    if (!autoFocus) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [autoFocus]);

  const handleSend = useCallback(async (): Promise<void> => {
    const content = draft.trim();
    if (disabled || isLoading || !content || !providerId || !modelId) return;

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
      characterPromptEnabled,
      ...(isCoder && codingWorkspaceRoot
        ? {
            codingWorkspaceRoot,
            codingWorkspaceLabel: codingWorkspaceLabel || undefined
          }
        : {})
    });
    setDraft('');
  }, [agentId, characterPromptEnabled, codingWorkspaceLabel, codingWorkspaceRoot, disabled, draft, isCoder, isLoading, modelId, onStart, presetId, providerId, webSearchEnabled]);

  const handleSendRef = useRef(handleSend);
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  // 按下语音按钮时的输入快照，用于取消时回滚本次识别的文字
  const preSpeechDraftRef = useRef<string | null>(null);

  // 停止语音输入后自动发送已识别的内容（handleSend 内部会校验空内容/禁用状态）
  const handleSpeechStopped = useCallback((): void => {
    preSpeechDraftRef.current = null;
    setSpeechInterim('');
    void handleSendRef.current();
  }, []);

  // 取消语音输入：回滚到按下前的输入内容
  const handleSpeechCancelled = useCallback((): void => {
    const snapshot = preSpeechDraftRef.current;
    preSpeechDraftRef.current = null;
    setSpeechInterim('');
    if (snapshot !== null) {
      setDraft(snapshot);
    }
  }, []);

  const handleTranscriptFinal = useCallback((text: string): void => {
    setSpeechInterim('');
    setDraft((current) => mergeTranscriptWithInput(current, text));
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  // 识别中间结果：实时显示在输入框（未转正，端点确认后由 handleTranscriptFinal 合并）
  const handleTranscriptInterim = useCallback((text: string): void => {
    setSpeechInterim(text);
  }, []);

  const speechInput = useSpeechInput({
    onTranscriptFinal: handleTranscriptFinal,
    onTranscriptInterim: handleTranscriptInterim,
    onStopped: handleSpeechStopped,
    onCancelled: handleSpeechCancelled
  });

  return (
    <div className={cn('no-drag pointer-events-auto m-1 flex h-12 w-[calc(100%-0.5rem)] items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg backdrop-blur box-border', className)}>
      <ProviderModelSelect
        providerId={providerId}
        presetId={presetId || undefined}
        modelId={modelId || undefined}
        onChange={(nextProviderId, nextModelId) => {
          setProviderId(nextProviderId);
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
        value={displayValue}
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
        onPressStart={() => {
          preSpeechDraftRef.current = draft;
          void speechInput.start();
        }}
        onPressEnd={speechInput.stop}
        onCancel={speechInput.cancel}
        buttonVariant="ghost"
        className="h-8 w-8 shrink-0"
      />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" size="icon" className="h-8 w-8 shrink-0 rounded-full" disabled={disabled || isLoading || !hasContent} aria-label="发送" onClick={() => void handleSend()}>
            {isLoading ? <TbLoader2 className="animate-spin" /> : <TbSend />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isLoading ? '正在打开对话' : '发送消息'}</TooltipContent>
      </Tooltip>
    </div>
  );
}
