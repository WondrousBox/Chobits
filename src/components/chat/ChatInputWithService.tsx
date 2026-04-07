import { useCallback, useRef } from 'react';
import { TbRobot } from 'react-icons/tb';
import { toast } from 'sonner';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { pickCodingWorkspace } from '@/lib/coding-workspace';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import ChatAgentSelect from './ChatAgentSelect';
import ChatFooterActions from './ChatFooterActions';
import CodingWorkspaceButton from './CodingWorkspaceButton';
import UnifiedChatInput, { UnifiedChatInputHandle, UnifiedChatInputProps } from './UnifiedChatInput';
import { mergeTranscriptWithInput, useSpeechInput } from './useSpeechInput';
import WebSearchToggle from './WebSearchToggle';

export interface ChatInputWithServiceProps extends Omit<UnifiedChatInputProps, 'onSend' | 'footerLeft'> {
  onStart: (params: {
    content: string;
    providerId: string;
    modelId: string;
    preferredPresetId?: string;
    agentId: string;
    codingWorkspaceRoot?: string;
    codingWorkspaceLabel?: string;
    webSearchEnabled?: boolean;
    characterPersonaEnabled?: boolean;
  }) => void | Promise<void>;
  onMenuOpenChange?: (open: boolean) => void;
}

export default function ChatInputWithService({ onStart, onMenuOpenChange, footerRightExtra, disabled, ...rest }: ChatInputWithServiceProps): JSX.Element {
  const {
    agents,
    providerId,
    modelId,
    presetId,
    agentId,
    codingWorkspaceRoot,
    codingWorkspaceLabel,
    webSearchEnabled,
    characterPersonaEnabled,
    setProviderId,
    setModelId,
    setAgentId,
    setCodingWorkspace,
    setWebSearchEnabled,
    setCharacterPersonaEnabled
  } = useChatSelection();
  const inputRef = useRef<UnifiedChatInputHandle>(null);

  const isCoder = agentId === 'coder';

  const handlePickWorkspace = async (): Promise<void> => {
    const workspace = await pickCodingWorkspace(codingWorkspaceRoot);
    if (!workspace) {
      return;
    }

    setCodingWorkspace(workspace);
  };

  const handleSend = async (content: string): Promise<void> => {
    if (!providerId || !modelId) return;

    if (isCoder && !codingWorkspaceRoot) {
      toast.error('代码助手需要先选择项目目录');
      return;
    }

    await onStart?.({
      content,
      providerId,
      modelId,
      preferredPresetId: presetId || undefined,
      agentId,
      webSearchEnabled,
      characterPersonaEnabled,
      ...(isCoder && codingWorkspaceRoot
        ? {
            codingWorkspaceRoot,
            codingWorkspaceLabel: codingWorkspaceLabel || undefined
          }
        : {})
    });
  };

  const handleTranscriptFinal = useCallback((text: string): void => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.setValue(mergeTranscriptWithInput(input.getValue(), text));
    input.focus();
  }, []);

  const speechInput = useSpeechInput({
    onTranscriptFinal: handleTranscriptFinal
  });

  return (
    <UnifiedChatInput
      ref={inputRef}
      {...rest}
      disabled={disabled}
      onSend={handleSend}
      showSaveButton={false}
      footerLeft={
        <div className="flex items-center gap-1 shrink-0 no-drag">
          <ChatAgentSelect agents={agents} value={agentId} onValueChange={setAgentId} />
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
            placeholder="选择模型"
            autoLoadFirst
            modelTypes={['chat']}
            onOpenChange={onMenuOpenChange}
          />
          <WebSearchToggle enabled={webSearchEnabled} onToggle={setWebSearchEnabled} />
          {!isCoder && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={characterPersonaEnabled ? 'default' : 'outline'}
                  size="sm"
                  className={`h-8 rounded-full text-xs ${characterPersonaEnabled ? 'bg-violet-600 hover:bg-violet-700 text-white' : ''}`}
                  onClick={() => setCharacterPersonaEnabled(!characterPersonaEnabled)}
                >
                  <TbRobot />
                  {characterPersonaEnabled ? '角色已注入' : '注入角色'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{characterPersonaEnabled ? '已注入角色人格到对话中，AI 将以角色身份回复' : '点击注入角色人格，AI 将根据好感度和心情调整说话风格'}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {isCoder && (
            <CodingWorkspaceButton
              workspaceRoot={codingWorkspaceRoot}
              workspaceLabel={codingWorkspaceLabel}
              onPick={handlePickWorkspace}
              onClear={() => setCodingWorkspace(null)}
              triggerVariant="outline"
              triggerSize="sm"
              triggerClassName="h-8 rounded-full text-xs"
              clearVariant="ghost"
              clearSize="icon"
              clearClassName="h-8 w-8 rounded-full"
            />
          )}
        </div>
      }
      footerRightExtra={
        <ChatFooterActions
          speechInput={{
            disabled,
            interimText: speechInput.interimText,
            isBusy: speechInput.isBusy,
            isListening: speechInput.isListening,
            onToggle: speechInput.toggle
          }}
        >
          {footerRightExtra}
        </ChatFooterActions>
      }
    />
  );
}
