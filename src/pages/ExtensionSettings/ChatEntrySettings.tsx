import React from 'react';
import { TbMessageCircle } from 'react-icons/tb';

import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

import { type ChatEntrySettingsState, useChatEntrySettings } from './useChatEntrySettings';

export const ChatEntryItem: React.FC<{
  state: ChatEntrySettingsState;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, selected, onSelect }) => (
  <div onClick={onSelect} className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30')}>
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0', state.isEnabled ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbMessageCircle className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">迷你聊天框</div>
      <div className="text-xs text-muted-foreground line-clamp-1">{state.description}</div>
    </div>
    <div onClick={(event) => event.stopPropagation()}>
      <Switch checked={state.isEnabled} disabled={state.isLoading || state.isPending} onCheckedChange={(checked) => void state.setEnabled(checked)} />
    </div>
  </div>
);

export const ChatEntryDetailContent: React.FC<{ state: ChatEntrySettingsState }> = ({ state }) => (
  <div className="space-y-2">
    <h3 className="text-base font-semibold text-foreground">迷你聊天框</h3>
    <p className="text-sm text-muted-foreground">{state.isEnabled ? '双击桌面精灵会打开跟随精灵的小输入窗。' : '双击桌面精灵会打开完整聊天窗口。'}</p>
  </div>
);

const ChatEntrySettings: React.FC = () => {
  const state = useChatEntrySettings();
  return <ChatEntryDetailContent state={state} />;
};

export default ChatEntrySettings;
