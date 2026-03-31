import { TbFolderCode, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inferCodingWorkspaceLabel } from '@/lib/coding-workspace';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import UnifiedChatInput, { UnifiedChatInputProps } from './UnifiedChatInput';
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
  }) => void | Promise<void>;
  onMenuOpenChange?: (open: boolean) => void;
}

export default function ChatInputWithService({ onStart, onMenuOpenChange, ...rest }: ChatInputWithServiceProps): JSX.Element {
  const {
    agents,
    providerId,
    modelId,
    presetId,
    agentId,
    codingWorkspaceRoot,
    codingWorkspaceLabel,
    webSearchEnabled,
    setProviderId,
    setModelId,
    setAgentId,
    setCodingWorkspace,
    setWebSearchEnabled
  } = useChatSelection();

  const isCoder = agentId === 'coder';

  const handlePickWorkspace = async (): Promise<void> => {
    const result = await window.YUA.file['file:pickDir']({
      defaultPath: codingWorkspaceRoot || undefined
    });

    if (result?.canceled || !result.path) {
      return;
    }

    setCodingWorkspace({
      root: result.path,
      label: inferCodingWorkspaceLabel(result.path)
    });
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
      ...(isCoder && codingWorkspaceRoot
        ? {
          codingWorkspaceRoot,
          codingWorkspaceLabel: codingWorkspaceLabel || undefined
        }
        : {})
    });
  };

  return (
    <UnifiedChatInput
      {...rest}
      onSend={handleSend}
      showSaveButton={false}
      footerLeft={
        <div className="flex items-center gap-2 shrink-0 no-drag">
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="h-8 max-w-32 rounded-full text-xs text-muted-foreground">
              <SelectValue placeholder="选择模式" />
            </SelectTrigger>
            <SelectContent className="text-xs">
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          {isCoder && (
            <>
              <Button type="button" variant="outline" size="sm" className="h-8 max-w-44 rounded-full text-xs" onClick={handlePickWorkspace} title={codingWorkspaceRoot || '选择项目目录'}>
                <TbFolderCode className="mr-1 h-4 w-4" />
                <span className="truncate">{codingWorkspaceLabel || '选择项目'}</span>
              </Button>
              {codingWorkspaceRoot && (
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setCodingWorkspace(null)} title="清除项目目录">
                  <TbX className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      }
    />
  );
}
