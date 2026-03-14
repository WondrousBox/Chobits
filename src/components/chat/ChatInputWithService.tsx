import ServicePresetSelect from '@/pages/ChatPage/components/ServicePresetSelect';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import UnifiedChatInput, { UnifiedChatInputProps } from './UnifiedChatInput';

export interface ChatInputWithServiceProps extends Omit<UnifiedChatInputProps, 'onSend' | 'footerLeft'> {
  /** 发送消息回调，包含选择的 provider/preset 信息 */
  onStart: (params: { content: string; providerId: string; presetId: string }) => void | Promise<void>;
  /** 下拉菜单打开状态变化回调 (用于调整窗口大小) */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * 带有智能体选择器的聊天输入组件
 * 用于 ChatPage 等需要选择 AI 服务的场景
 */
export default function ChatInputWithService({ onStart, onMenuOpenChange, ...rest }: ChatInputWithServiceProps): JSX.Element {
  const { providerId, presetId, setProviderId, setPresetId, getOrderedPresets } = useChatSelection();

  const handleSend = async (content: string): Promise<void> => {
    if (!presetId) return;
    await onStart?.({ content, providerId, presetId });
  };

  return (
    <UnifiedChatInput
      {...rest}
      onSend={handleSend}
      showSaveButton={false}
      footerLeft={
        <div className="shrink-0 no-drag">
          <ServicePresetSelect
            providerId={providerId}
            presetId={presetId}
            onChange={(pid, nextPresetId) => {
              setProviderId(pid);
              setPresetId(nextPresetId);
            }}
            buttonVariant="outline"
            buttonSize="sm"
            orderPresets={(list, pid) => (getOrderedPresets ? getOrderedPresets(pid) : list)}
            onOpenChange={onMenuOpenChange}
          />
        </div>
      }
    />
  );
}
