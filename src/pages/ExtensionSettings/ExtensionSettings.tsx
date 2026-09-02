import type { SpriteCapabilityState } from '@packages/sprite-core/capability-registry';
import React, { useState } from 'react';
import { toast } from 'sonner';

import { ScrollArea } from '@/components/ui/scroll-area';
import { getSpriteCapabilityLockedReason, getSpriteCapabilityState } from '@/features/sprite/capability-guard';
import { useSpriteCapabilitySnapshot } from '@/features/sprite/hooks/useSpriteCapabilitySnapshot';

import { ChatEntryDetailContent, ChatEntryItem } from './ChatEntrySettings';
import { SpeakDetailContent, SpeakItem } from './SpeakSettings';
import { SpeechRecognitionDetailContent, SpeechRecognitionItem } from './SpeechRecognitionSettings';
import { SpontaneousUtteranceDetailContent, SpontaneousUtteranceItem } from './SpontaneousUtteranceSettings';
import { useChatEntrySettings } from './useChatEntrySettings';
import { useSpeakSettings } from './useSpeakSettings';
import { useSpeechRecognitionSettings } from './useSpeechRecognitionSettings';
import { useSpontaneousUtteranceSettings } from './useSpontaneousUtteranceSettings';
import { WindowAnimationDetailContent, WindowAnimationItem } from './WindowAnimationSettings';

type SkillKey = 'chatEntry' | 'speak' | 'windowAnimation' | 'spontaneous' | 'speechRecognition';

const ExtensionSettings: React.FC = () => {
  const [selected, setSelected] = useState<SkillKey>('chatEntry');
  const { snapshot: capabilitySnapshot, refresh: refreshCapabilitySnapshot } = useSpriteCapabilitySnapshot();

  const handleCapabilityBlocked = React.useCallback((capability: SpriteCapabilityState) => {
    toast.info(`${capability.name} 尚未解锁`, {
      description: getSpriteCapabilityLockedReason(capability)
    });
  }, []);

  const speechRecognitionCapability = getSpriteCapabilityState(capabilitySnapshot, 'speechRecognition');
  const chatEntryState = useChatEntrySettings();
  const speakState = useSpeakSettings();
  const spontaneousUtteranceState = useSpontaneousUtteranceSettings();
  const speechRecState = useSpeechRecognitionSettings({ capability: speechRecognitionCapability, onBlocked: handleCapabilityBlocked, afterChange: refreshCapabilitySnapshot });

  const renderDetail = (): React.ReactNode => {
    switch (selected) {
      case 'chatEntry':
        return <ChatEntryDetailContent state={chatEntryState} />;
      case 'speak':
        return <SpeakDetailContent state={speakState} />;
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
            <SpeakItem state={speakState} selected={selected === 'speak'} onSelect={() => setSelected('speak')} />
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
