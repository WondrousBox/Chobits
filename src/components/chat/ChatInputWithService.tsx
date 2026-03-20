import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import UnifiedChatInput, { UnifiedChatInputProps } from './UnifiedChatInput';

export interface ChatInputWithServiceProps extends Omit<UnifiedChatInputProps, 'onSend' | 'footerLeft'> {
  /** 发送消息回调，包含选择的 provider/model 与隐藏 preset 偏好 */
  onStart: (params: { content: string; providerId: string; modelId: string; preferredPresetId?: string }) => void | Promise<void>;
  /** 下拉菜单打开状态变化回调 (用于调整窗口大小) */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * 带有智能体选择器的聊天输入组件
 * 用于 ChatPage 等需要选择 AI 服务的场景
 */
export default function ChatInputWithService({ onStart, onMenuOpenChange, ...rest }: ChatInputWithServiceProps): JSX.Element {
  const { providerId, modelId, presetId, setProviderId, setModelId } = useChatSelection();

  const handleSend = async (content: string): Promise<void> => {
    if (!providerId || !modelId) return;
    await onStart?.({ content, providerId, modelId, preferredPresetId: presetId || undefined });
  };

  return (
    <UnifiedChatInput
      {...rest}
      onSend={handleSend}
      showSaveButton={false}
      footerLeft={
        <div className="shrink-0 no-drag">
          <ProviderModelSelect
            providerId={providerId}
            presetId={presetId || undefined}
            modelId={modelId || undefined}
            onChange={(pid, nextModelId) => {
              setProviderId(pid);
              setModelId(nextModelId);
            }}
            buttonVariant="outline"
            buttonSize="sm"
            placeholder="选择模型"
            autoLoadFirst
            modelTypes={['chat']}
            onOpenChange={onMenuOpenChange}
          />
        </div>
      }
    />
  );
}
