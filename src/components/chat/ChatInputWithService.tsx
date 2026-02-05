import ServiceInstanceSelect from '@/pages/ChatPage/components/ServiceInstanceSelect';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import UnifiedChatInput, { UnifiedChatInputProps } from './UnifiedChatInput';

export interface ChatInputWithServiceProps extends Omit<UnifiedChatInputProps, 'onSend' | 'footerLeft'> {
  /** 发送消息回调，包含选择的 provider/instance 信息 */
  onStart: (params: { content: string; providerId: string; instanceId: string }) => void | Promise<void>;
  /** 下拉菜单打开状态变化回调 (用于调整窗口大小) */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * 带有智能体选择器的聊天输入组件
 * 用于 ChatPage 等需要选择 AI 服务的场景
 */
export default function ChatInputWithService({ onStart, onMenuOpenChange, ...rest }: ChatInputWithServiceProps): JSX.Element {
  const { providerId, instanceId, setProviderId, setInstanceId, getOrderedInstances } = useChatSelection();

  const handleSend = async (content: string): Promise<void> => {
    if (!instanceId) return;
    await onStart?.({ content, providerId, instanceId });
  };

  return (
    <UnifiedChatInput
      {...rest}
      onSend={handleSend}
      showSaveButton={false}
      footerLeft={
        <div className="shrink-0 no-drag">
          <ServiceInstanceSelect
            providerId={providerId}
            instanceId={instanceId}
            onChange={(pid, iid) => {
              setProviderId(pid);
              setInstanceId(iid);
            }}
            buttonVariant="outline"
            buttonSize="sm"
            orderInstances={(list, pid) => (getOrderedInstances ? getOrderedInstances(pid) : list)}
            onOpenChange={onMenuOpenChange}
          />
        </div>
      }
    />
  );
}
