import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ServiceInstanceSelect from '@/pages/ChatPage/components/ServiceInstanceSelect';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import UnifiedChatInput, { UnifiedChatInputProps } from './UnifiedChatInput';

export interface ChatInputWithServiceProps extends Omit<UnifiedChatInputProps, 'onSend' | 'footerLeft'> {
  /** 发送消息回调，包含选择的 provider/instance/agent 信息 */
  onStart: (params: { content: string; providerId: string; instanceId: string; agentId: string }) => void | Promise<void>;
  /** 下拉菜单打开状态变化回调 (用于调整窗口大小) */
  onMenuOpenChange?: (open: boolean) => void;
}

/**
 * 带有服务实例选择器和 Agent 选择器的聊天输入组件
 * 用于 ChatPage 等需要选择 AI 服务的场景
 */
export default function ChatInputWithService({ onStart, onMenuOpenChange, ...rest }: ChatInputWithServiceProps): JSX.Element {
  const { agents, providerId, instanceId, agentId, setProviderId, setInstanceId, setAgentId, getOrderedInstances } = useChatSelection();

  const handleSend = async (content: string): Promise<void> => {
    if (!instanceId) return;
    await onStart?.({ content, providerId, instanceId, agentId });
  };

  return (
    <UnifiedChatInput
      {...rest}
      onSend={handleSend}
      showSaveButton={false}
      footerLeft={
        <>
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
