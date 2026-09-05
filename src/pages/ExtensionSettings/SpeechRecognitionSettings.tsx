import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { TbEar, TbLoader2, TbPlayerPlay, TbPlayerStop, TbSettings } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SpriteCapabilityLockedNotice } from '@/features/sprite/capability-ui';
import { cn } from '@/lib/utils';

import type { SpeechRecognitionSettingsState } from './useSpeechRecognitionSettings';
import { useSpeechRecognitionSettings } from './useSpeechRecognitionSettings';

/* ─── Left-panel item ─── */
export const SpeechRecognitionItem: React.FC<{
  state: SpeechRecognitionSettingsState;
  capability?: SpriteCapabilityState | null;
  selected: boolean;
  onSelect: () => void;
}> = ({ state, capability, selected, onSelect }) => {
  const { t } = useTranslation('speech');
  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors hover:bg-accent/50',
        selected && 'bg-accent ring-1 ring-primary/30',
        capability?.status === 'locked' && 'opacity-70'
      )}
    >
      <div className={cn('flex h-10 w-10 items-center justify-center rounded-full shrink-0 transition-colors', state.isRunning ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
        <TbEar className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{t('recognition.item.title')}</div>
        <div className="text-xs text-muted-foreground line-clamp-1">{t('recognition.item.description')}</div>
      </div>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {(state.isLoading || state.isChecking) && <TbLoader2 className="animate-spin h-4 w-4 text-muted-foreground" />}
        <Switch checked={state.isRunning} onCheckedChange={state.handleToggle} disabled={state.isLoading || state.isChecking || capability?.status === 'locked'} />
      </div>
    </div>
  );
};

/* ─── Right-panel detail ─── */
export const SpeechRecognitionDetailContent: React.FC<{ state: SpeechRecognitionSettingsState; capability?: SpriteCapabilityState | null }> = ({ state, capability }) => {
  const { t } = useTranslation('speech');
  if (capability?.status === 'locked') {
    return <SpriteCapabilityLockedNotice capability={capability} hint={t('recognition.lockedHint')} />;
  }

  const { isRunning, isLoading, handleToggle } = state;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', isRunning ? 'bg-green-500' : 'bg-gray-400')} />
          <span className="text-sm font-medium">{isRunning ? t('recognition.status.running') : t('recognition.status.stopped')}</span>
        </div>
        <p className="text-xs text-muted-foreground">{isRunning ? t('recognition.description.running') : t('recognition.description.stopped')}</p>
      </div>

      <div className="flex gap-2">
        {isRunning ? (
          <Button size="sm" variant="destructive" disabled={isLoading} onClick={() => handleToggle(false)} className="gap-2">
            <TbPlayerStop /> {t('recognition.action.stop')}
          </Button>
        ) : (
          <Button size="sm" variant="default" disabled={isLoading} onClick={() => handleToggle(true)} className="gap-2">
            <TbPlayerPlay /> {t('recognition.action.start')}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => window.chobits.window['window:open']('asrConfig')} className="gap-2" disabled={isLoading}>
          <TbSettings /> {t('recognition.action.config')}
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
