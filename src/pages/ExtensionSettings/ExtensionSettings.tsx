import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { ScrollArea } from '@/components/ui/scroll-area';
import { getSpriteCapabilityLockedReason, getSpriteCapabilityState } from '@/features/sprite-assistant/capability-ui';
import { useSpriteCapabilitySnapshot } from '@/features/sprite-assistant/hooks/useSpriteCapabilitySnapshot';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

import { ChatEntryDetailContent, ChatEntryItem } from './ChatEntrySettings';
import { DanceAnimationDetailContent, DanceAnimationItem } from './DanceAnimationSettings';
import { MovementDetailContent, MovementItem } from './MovementSettings';
import { MovToWebmConverterDetailContent, MovToWebmConverterItem } from './MovToWebmConverterSettings';
import { SpeakDetailContent, SpeakItem, useSpeakSettings } from './SpeakSettings';
import { SpeechRecognitionDetailContent, SpeechRecognitionItem, useSpeechRecognitionSettings } from './SpeechRecognitionSettings';
import { SpontaneousUtteranceDetailContent, SpontaneousUtteranceItem } from './SpontaneousUtteranceSettings';
import { useChatEntrySettings } from './useChatEntrySettings';
import { useMovementSettings } from './useMovementSettings';
import { useMusicDanceSettings } from './useMusicDanceSettings';
import { useSpontaneousUtteranceSettings } from './useSpontaneousUtteranceSettings';
import { WindowAnimationDetailContent, WindowAnimationItem } from './WindowAnimationSettings';

type SkillKey = 'chatEntry' | 'movement' | 'speak' | 'danceAnimation' | 'movToWebm' | 'windowAnimation' | 'spontaneous' | 'speechRecognition';

const ExtensionSettings: React.FC = () => {
  const [selected, setSelected] = useState<SkillKey>('chatEntry');
  const { snapshot: capabilitySnapshot, refresh: refreshCapabilitySnapshot } = useSpriteCapabilitySnapshot();
  const { isEnabled } = useFeatureFlags();
  const musicEnabled = isEnabled('music');

  const handleCapabilityBlocked = React.useCallback((capability: SpriteCapabilityState) => {
    toast.info(`${capability.name} 尚未解锁`, {
      description: getSpriteCapabilityLockedReason(capability)
    });
  }, []);

  const movementCapability = getSpriteCapabilityState(capabilitySnapshot, 'movement');
  const speechRecognitionCapability = getSpriteCapabilityState(capabilitySnapshot, 'speechRecognition');
  const chatEntryState = useChatEntrySettings();
  const movementState = useMovementSettings({ capability: movementCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });
  const speakState = useSpeakSettings();
  const musicDanceState = useMusicDanceSettings();
  const spontaneousUtteranceState = useSpontaneousUtteranceSettings();
  const speechRecState = useSpeechRecognitionSettings({ capability: speechRecognitionCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });

  const renderDetail = (): React.ReactNode => {
    switch (selected) {
      case 'chatEntry':
        return <ChatEntryDetailContent state={chatEntryState} />;
      case 'movement':
        return <MovementDetailContent state={movementState} capability={movementCapability} />;
      case 'speak':
        return <SpeakDetailContent state={speakState} />;
      case 'danceAnimation':
        return musicEnabled ? <DanceAnimationDetailContent state={musicDanceState} /> : null;
      case 'movToWebm':
        return <MovToWebmConverterDetailContent />;
      case 'windowAnimation':
        return <WindowAnimationDetailContent />;
      case 'spontaneous':
        return <SpontaneousUtteranceDetailContent state={spontaneousUtteranceState} />;
      case 'speechRecognition':
        return <SpeechRecognitionDetailContent state={speechRecState} capability={speechRecognitionCapability} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 border-t-0 border-l-0 border-b-0 border-r border-solid border-ring">
        <ScrollArea className="h-full">
          <div className="space-y-1 pr-2">
            <ChatEntryItem state={chatEntryState} selected={selected === 'chatEntry'} onSelect={() => setSelected('chatEntry')} />
            <MovementItem state={movementState} capability={movementCapability} selected={selected === 'movement'} onSelect={() => setSelected('movement')} />
            <SpeakItem state={speakState} selected={selected === 'speak'} onSelect={() => setSelected('speak')} />
            {musicEnabled && <DanceAnimationItem state={musicDanceState} selected={selected === 'danceAnimation'} onSelect={() => setSelected('danceAnimation')} />}
            <MovToWebmConverterItem selected={selected === 'movToWebm'} onSelect={() => setSelected('movToWebm')} />
            <WindowAnimationItem selected={selected === 'windowAnimation'} onSelect={() => setSelected('windowAnimation')} />
            <SpontaneousUtteranceItem state={spontaneousUtteranceState} selected={selected === 'spontaneous'} onSelect={() => setSelected('spontaneous')} />
            <SpeechRecognitionItem state={speechRecState} capability={speechRecognitionCapability} selected={selected === 'speechRecognition'} onSelect={() => setSelected('speechRecognition')} />
          </div>
        </ScrollArea>
      </div>

      <div className="flex-1 min-w-0 px-2">
        <ScrollArea className="h-full">
          <div className="pr-2">{renderDetail()}</div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ExtensionSettings;
