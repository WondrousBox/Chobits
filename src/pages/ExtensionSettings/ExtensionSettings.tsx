import React, { useState } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';

import { DailyCareDetailContent, DailyCareItem, useDailyCareSettings } from './DailyCareSettings';
import { MovementDetailContent, MovementItem, useMovementSettings } from './MovementSettings';
import { RecorderDetailContent, RecorderItem, useRecorderSettings } from './RecorderSettings';
import { ScreenshotDetailContent, ScreenshotItem, useScreenshotSettings } from './ScreenshotSettings';
import { SpeakDetailContent, SpeakItem, useSpeakSettings } from './SpeakSettings';
import { SpeechRecognitionDetailContent, SpeechRecognitionItem, useSpeechRecognitionSettings } from './SpeechRecognitionSettings';
import { SpriteDetailContent, SpriteItem, useSpriteSettings } from './SpriteSettings';

type SkillKey = 'movement' | 'speak' | 'dailyCare' | 'sprite' | 'recorder' | 'speechRecognition' | 'screenshot';

const ExtensionSettings: React.FC = () => {
  const [selected, setSelected] = useState<SkillKey>('movement');

  const movementState = useMovementSettings();
  const speakState = useSpeakSettings();
  const dailyCareState = useDailyCareSettings();
  const spriteState = useSpriteSettings();
  const recorderState = useRecorderSettings();
  const speechRecState = useSpeechRecognitionSettings();
  const screenshotState = useScreenshotSettings();

  const renderDetail = (): React.ReactNode => {
    switch (selected) {
      case 'movement':
        return <MovementDetailContent state={movementState} />;
      case 'speak':
        return <SpeakDetailContent state={speakState} />;
      case 'dailyCare':
        return <DailyCareDetailContent state={dailyCareState} />;
      case 'sprite':
        return <SpriteDetailContent state={spriteState} />;
      case 'recorder':
        return <RecorderDetailContent state={recorderState} />;
      case 'speechRecognition':
        return <SpeechRecognitionDetailContent state={speechRecState} />;
      case 'screenshot':
        return <ScreenshotDetailContent state={screenshotState} />;
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
            <MovementItem state={movementState} selected={selected === 'movement'} onSelect={() => setSelected('movement')} />
            <SpeakItem state={speakState} selected={selected === 'speak'} onSelect={() => setSelected('speak')} />
            <DailyCareItem state={dailyCareState} selected={selected === 'dailyCare'} onSelect={() => setSelected('dailyCare')} />
            <SpriteItem state={spriteState} selected={selected === 'sprite'} onSelect={() => setSelected('sprite')} />
            <RecorderItem state={recorderState} selected={selected === 'recorder'} onSelect={() => setSelected('recorder')} />
            <SpeechRecognitionItem state={speechRecState} selected={selected === 'speechRecognition'} onSelect={() => setSelected('speechRecognition')} />
            <ScreenshotItem state={screenshotState} selected={selected === 'screenshot'} onSelect={() => setSelected('screenshot')} />
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
