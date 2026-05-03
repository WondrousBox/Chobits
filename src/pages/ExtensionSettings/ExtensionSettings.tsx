import React, { useState } from 'react';
import { toast } from 'sonner';

import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getSpriteCapabilityLockedReason, getSpriteCapabilityState } from '@/features/sprite-assistant/capability-ui';
import { useSpriteCapabilitySnapshot } from '@/features/sprite-assistant/hooks/useSpriteCapabilitySnapshot';

import { DailyCareDetailContent, DailyCareItem, useDailyCareSettings } from './DailyCareSettings';
import { MovementDetailContent, MovementItem } from './MovementSettings';
import { PurposePlannerDetailContent, PurposePlannerItem } from './PurposePlannerSettings';
import { RecorderDetailContent, RecorderItem, useRecorderSettings } from './RecorderSettings';
import { ScreenshotDetailContent, ScreenshotItem, useScreenshotSettings } from './ScreenshotSettings';
import { SpeakDetailContent, SpeakItem, useSpeakSettings } from './SpeakSettings';
import { SpeechRecognitionDetailContent, SpeechRecognitionItem, useSpeechRecognitionSettings } from './SpeechRecognitionSettings';
import { SpontaneousUtteranceDetailContent, SpontaneousUtteranceItem } from './SpontaneousUtteranceSettings';
import { SpriteDetailContent, SpriteItem, useSpriteSettings } from './SpriteSettings';
import { useMovementSettings } from './useMovementSettings';
import { usePurposePlannerSettings } from './usePurposePlannerSettings';
import { useSpontaneousUtteranceSettings } from './useSpontaneousUtteranceSettings';

type SkillKey = 'movement' | 'speak' | 'dailyCare' | 'sprite' | 'spontaneous' | 'purposePlanner' | 'recorder' | 'speechRecognition' | 'screenshot';

const ExtensionSettings: React.FC = () => {
  const [selected, setSelected] = useState<SkillKey>('movement');
  const { snapshot: capabilitySnapshot, refresh: refreshCapabilitySnapshot } = useSpriteCapabilitySnapshot();

  const handleCapabilityBlocked = React.useCallback((capability: SpriteCapabilityState) => {
    toast.info(`${capability.name} 尚未解锁`, {
      description: getSpriteCapabilityLockedReason(capability)
    });
  }, []);

  const movementCapability = getSpriteCapabilityState(capabilitySnapshot, 'movement');
  const dailyCareCapability = getSpriteCapabilityState(capabilitySnapshot, 'dailyCare');
  const recorderCapability = getSpriteCapabilityState(capabilitySnapshot, 'microphone');
  const speechRecognitionCapability = getSpriteCapabilityState(capabilitySnapshot, 'speechRecognition');
  const screenshotCapability = getSpriteCapabilityState(capabilitySnapshot, 'screenshot');
  const actionChoreographyCapability = getSpriteCapabilityState(capabilitySnapshot, 'actionChoreography');

  const movementState = useMovementSettings({ capability: movementCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });
  const speakState = useSpeakSettings();
  const dailyCareState = useDailyCareSettings({ capability: dailyCareCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });
  const spriteState = useSpriteSettings();
  const spontaneousUtteranceState = useSpontaneousUtteranceSettings();
  const purposePlannerState = usePurposePlannerSettings();
  const recorderState = useRecorderSettings({ capability: recorderCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });
  const speechRecState = useSpeechRecognitionSettings({ capability: speechRecognitionCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });
  const screenshotState = useScreenshotSettings({ capability: screenshotCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });

  const renderDetail = (): React.ReactNode => {
    switch (selected) {
      case 'movement':
        return <MovementDetailContent state={movementState} capability={movementCapability} />;
      case 'speak':
        return <SpeakDetailContent state={speakState} />;
      case 'dailyCare':
        return <DailyCareDetailContent state={dailyCareState} capability={dailyCareCapability} />;
      case 'sprite':
        return <SpriteDetailContent state={spriteState} actionChoreographyCapability={actionChoreographyCapability} onBlocked={handleCapabilityBlocked} />;
      case 'spontaneous':
        return <SpontaneousUtteranceDetailContent state={spontaneousUtteranceState} />;
      case 'purposePlanner':
        return <PurposePlannerDetailContent state={purposePlannerState} />;
      case 'recorder':
        return <RecorderDetailContent state={recorderState} capability={recorderCapability} />;
      case 'speechRecognition':
        return <SpeechRecognitionDetailContent state={speechRecState} capability={speechRecognitionCapability} />;
      case 'screenshot':
        return <ScreenshotDetailContent state={screenshotState} capability={screenshotCapability} />;
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* 左侧机能列表 */}
      <div className="w-64 shrink-0 border-t-0 border-l-0 border-b-0 border-r border-solid border-ring">
        <ScrollArea className="h-full">
          <div className="space-y-1 pr-2">
            <MovementItem state={movementState} capability={movementCapability} selected={selected === 'movement'} onSelect={() => setSelected('movement')} />
            <SpeakItem state={speakState} selected={selected === 'speak'} onSelect={() => setSelected('speak')} />
            <DailyCareItem state={dailyCareState} capability={dailyCareCapability} selected={selected === 'dailyCare'} onSelect={() => setSelected('dailyCare')} />
            <SpriteItem state={spriteState} selected={selected === 'sprite'} onSelect={() => setSelected('sprite')} />
            <SpontaneousUtteranceItem state={spontaneousUtteranceState} selected={selected === 'spontaneous'} onSelect={() => setSelected('spontaneous')} />
            <PurposePlannerItem state={purposePlannerState} selected={selected === 'purposePlanner'} onSelect={() => setSelected('purposePlanner')} />
            <RecorderItem state={recorderState} capability={recorderCapability} selected={selected === 'recorder'} onSelect={() => setSelected('recorder')} />
            <SpeechRecognitionItem state={speechRecState} capability={speechRecognitionCapability} selected={selected === 'speechRecognition'} onSelect={() => setSelected('speechRecognition')} />
            <ScreenshotItem state={screenshotState} capability={screenshotCapability} selected={selected === 'screenshot'} onSelect={() => setSelected('screenshot')} />
          </div>
        </ScrollArea>
      </div>

      {/* 右侧详细设置 */}
      <div className="flex-1 min-w-0 px-2">
        <ScrollArea className="h-full">
          <div className="pr-2">{renderDetail()}</div>
        </ScrollArea>
      </div>
    </div>
  );
};

export default ExtensionSettings;
