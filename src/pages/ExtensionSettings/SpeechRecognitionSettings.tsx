import React, { useEffect, useState } from 'react';
import { TbEar, TbLoader2, TbPlayerPlay, TbPlayerStop, TbSettings } from 'react-icons/tb';

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SpriteCapabilityLockedNotice, ensureSpriteCapabilityAccessible, type SpriteCapabilityGuardOptions } from '@/features/sprite-assistant/capability-ui';
import { cn } from '@/lib/utils';

/* ─── Hook ─── */
export function useSpeechRecognitionSettings(options?: SpriteCapabilityGuardOptions) {
  const [isRunning, setIsRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const checkStatus = async (): Promise<void> => {
    try {
      const status = await window.YUA.sherpa.getStatus();
      setIsRunning(status.running);
    } catch (error) {
      console.error('查询 ASR 状态失败:', error);
      setIsRunning(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await checkStatus();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleFocus = (): void => {
      checkStatus();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleToggle = async (checked: boolean): Promise<void> => {
    if (checked && !ensureSpriteCapabilityAccessible(options?.capability, options?.onBlocked)) {
      return;
    }
    setLoading(true);
    try {
      if (checked) {
        window.YUA.window['window:open']('asrConfig');
      } else {
        await window.YUA.sherpa.freeInstance();
        await window.YUA.sherpa.saveASRConfig({ enabled: false });
        setIsRunning(false);
      }
    } catch (error) {
      console.error('切换 ASR 服务失败:', error);
    } finally {
      setLoading(false);
      await options?.afterChange?.();
    }
  };

  return { isRunning, loading, checking, capability: options?.capability ?? null, handleToggle, checkStatus };
}

export type SpeechRecognitionSettingsState = ReturnType<typeof useSpeechRecognitionSettings>;

/* ─── Left-panel item ─── */
export const SpeechRecognitionItem: React.FC<{
  state: SpeechRecognitionSettingsState;
  capability?: SpriteCapabilityState | null;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, capability, selected, onSelect }) => (
  <div
    onClick={onSelect}
    className={cn('flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50', selected && 'bg-accent ring-1 ring-primary/30', capability?.status === 'locked' && 'opacity-70')}
  >
    <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors', state.isRunning ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
      <TbEar className="h-5 w-5" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="text-sm font-medium text-foreground">语音识别服务</div>
      <div className="text-xs text-muted-foreground line-clamp-1">实时语音识别，将语音转为文字。</div>
    </div>
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {(state.loading || state.checking) && <TbLoader2 className="animate-spin h-4 w-4 text-muted-foreground" />}
      <Switch checked={state.isRunning} onCheckedChange={state.handleToggle} disabled={state.loading || state.checking || capability?.status === 'locked'} />
    </div>
  </div>
);

/* ─── Right-panel detail ─── */
export const SpeechRecognitionDetailContent: React.FC<{ state: SpeechRecognitionSettingsState; capability?: SpriteCapabilityState | null }> = ({ state, capability }) => {
  if (capability?.status === 'locked') {
    return <SpriteCapabilityLockedNotice capability={capability} hint="语音识别属于成长型能力，解锁后才会允许打开配置页和启动运行态服务。" />;
  }

  const { isRunning, loading, handleToggle } = state;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', isRunning ? 'bg-green-500' : 'bg-gray-400')} />
          <span className="text-sm font-medium">{isRunning ? '语音识别服务运行中' : '语音识别服务未启动'}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {isRunning ? '服务正在运行，可在录音窗口中使用实时语音识别。关闭录音窗口不会停止服务。' : '启动后将加载语音识别模型。可通过开关或右键菜单控制服务。'}
        </p>
      </div>

      <div className="flex gap-2">
        {isRunning ? (
          <Button size="sm" variant="destructive" disabled={loading} onClick={() => handleToggle(false)} className="gap-2">
            <TbPlayerStop /> 停止服务
          </Button>
        ) : (
          <Button size="sm" variant="default" disabled={loading} onClick={() => handleToggle(true)} className="gap-2">
            <TbPlayerPlay /> 启动服务
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => window.YUA.window['window:open']('asrConfig')} className="gap-2" disabled={loading}>
          <TbSettings /> 识别配置
        </Button>
      </div>
    </div>
  );
};

/* ─── Default: self-contained detail (for SkillDetailPanel) ─── */
const SpeechRecognitionSettings: React.FC<{ capability?: SpriteCapabilityState | null }> = ({ capability }) => {
  const state = useSpeechRecognitionSettings({ capability });
  return <SpeechRecognitionDetailContent state={state} capability={capability} />;
};

export default SpeechRecognitionSettings;
