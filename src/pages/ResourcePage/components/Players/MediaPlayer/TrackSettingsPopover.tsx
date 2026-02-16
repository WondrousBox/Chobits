import React, { useCallback, useEffect, useState } from 'react';
import { TbCheck, TbMusic, TbScissors, TbSubtask } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { dispatchTrackToggle, TRACK_SETTINGS_UPDATE_EVENT, type TrackSettingsItem, type TrackType } from './trackSettingsEvent';

/** 轨道类型对应的图标和分组标签 */
const GROUP_CONFIG: Record<TrackType, { label: string; icon: React.ReactNode }> = {
  subtitle: { label: '字幕轨道', icon: <TbSubtask className="w-3.5 h-3.5" /> },
  tts: { label: 'TTS 音频轨道', icon: <TbMusic className="w-3.5 h-3.5" /> },
  clip: { label: '剪辑轨道', icon: <TbScissors className="w-3.5 h-3.5" /> }
};

/** 复选框组件 */
const Checkbox: React.FC<{ checked: boolean; disabled?: boolean; isVideo?: boolean }> = ({ checked, disabled, isVideo }) => (
  <div
    className={`w-3.5 h-3.5 rounded-sm border shrink-0 flex items-center justify-center transition-colors ${disabled
        ? isVideo
          ? 'border-white/30 bg-white/10'
          : 'border-muted-foreground/30 bg-muted/50'
        : checked
          ? isVideo
            ? 'border-white bg-white/90'
            : 'border-primary bg-primary'
          : isVideo
            ? 'border-white/50 bg-transparent'
            : 'border-muted-foreground/50 bg-transparent'
      }`}
  >
    {checked && <TbCheck className={`w-2.5 h-2.5 ${disabled ? 'opacity-50' : ''} ${isVideo ? 'text-black' : 'text-primary-foreground'}`} />}
  </div>
);

interface TrackSettingsPopoverProps {
  type: 'video' | 'audio';
}

/**
 * 轨道设置弹出框，监听来自 ResourceSubtitlePlayer 广播的轨道信息，
 * 用户切换某个轨道时发送 toggle 事件。主轨道始终启用、不可交互。
 */
export const TrackSettingsPopover: React.FC<TrackSettingsPopoverProps> = ({ type }) => {
  const [items, setItems] = useState<TrackSettingsItem[]>([]);

  // 监听轨道信息广播
  useEffect(() => {
    const handler = (e: Event): void => {
      const ev = e as CustomEvent<TrackSettingsItem[]>;
      setItems(ev.detail);
    };
    window.addEventListener(TRACK_SETTINGS_UPDATE_EVENT, handler);
    return () => window.removeEventListener(TRACK_SETTINGS_UPDATE_EVENT, handler);
  }, []);

  const handleToggle = useCallback((item: TrackSettingsItem) => {
    if (item.isMain) return; // 主轨道不可切换
    dispatchTrackToggle({ id: item.id, type: item.type });
  }, []);

  // 没有可用轨道信息时不渲染按钮
  if (items.length === 0) return null;

  // 按类型分组
  const groups = new Map<TrackType, TrackSettingsItem[]>();
  for (const item of items) {
    const list = groups.get(item.type) || [];
    list.push(item);
    groups.set(item.type, list);
  }

  const isVideo = type === 'video';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className={`w-8 h-8 p-0 hover:bg-white/20 ${isVideo ? 'text-white' : 'text-foreground'}`} title="轨道设置">
          <TbSubtask size={16} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className={`w-56 p-2 ${isVideo ? 'bg-black/90 border-white/20 text-white' : 'bg-background border text-foreground'}`}>
        <div className="text-xs font-semibold mb-2 px-1 opacity-70">轨道设置</div>
        {(['subtitle', 'tts', 'clip'] as TrackType[]).map((groupType) => {
          const groupItems = groups.get(groupType);
          if (!groupItems || groupItems.length === 0) return null;
          const cfg = GROUP_CONFIG[groupType];
          return (
            <div key={groupType} className="mb-1.5 last:mb-0">
              <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] font-medium opacity-50 uppercase tracking-wider">
                {cfg.icon}
                {cfg.label}
              </div>
              {groupItems.map((item) => (
                <button
                  key={item.id}
                  className={`flex items-center gap-2 w-full px-2 py-1 rounded text-xs transition-colors ${item.isMain ? 'cursor-default opacity-70' : isVideo ? 'hover:bg-white/15 cursor-pointer' : 'hover:bg-accent cursor-pointer'} ${!item.enabled && !item.isMain ? 'opacity-40' : ''}`}
                  onClick={() => handleToggle(item)}
                >
                  <Checkbox checked={item.enabled} disabled={item.isMain} isVideo={isVideo} />
                  <span className="truncate">{item.label}</span>
                </button>
              ))}
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
};
