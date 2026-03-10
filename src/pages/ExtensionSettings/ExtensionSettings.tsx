import React, { useState } from 'react';

import DailyCareSettings from './DailyCareSettings';
import MovementSettings from './MovementSettings';
import RecorderSettings from './RecorderSettings';
import ScreenshotSettings from './ScreenshotSettings';
import SpeakSettings from './SpeakSettings';
import SpeechRecognitionSettings from './SpeechRecognitionSettings';
import SpriteSettings from './SpriteSettings';

type ExtensionPanel = 'movement' | 'dailyCare' | 'sprite' | 'speak' | 'recorder' | 'screenshot' | 'speechRecognition' | null;

const ExtensionSettings: React.FC = () => {
  const [activePanel, setActivePanel] = useState<ExtensionPanel>('movement');

  const handleExpand = (panel: ExtensionPanel): void => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  return (
    <div className="space-y-3 px-2">
      <MovementSettings expanded={activePanel === 'movement'} onExpand={() => handleExpand('movement')} />
      <SpeakSettings expanded={activePanel === 'speak'} onExpand={() => handleExpand('speak')} />
      <DailyCareSettings expanded={activePanel === 'dailyCare'} onExpand={() => handleExpand('dailyCare')} />
      <SpriteSettings expanded={activePanel === 'sprite'} onExpand={() => handleExpand('sprite')} />
      <RecorderSettings expanded={activePanel === 'recorder'} onExpand={() => handleExpand('recorder')} />
      <SpeechRecognitionSettings expanded={activePanel === 'speechRecognition'} onExpand={() => handleExpand('speechRecognition')} />
      <ScreenshotSettings expanded={activePanel === 'screenshot'} onExpand={() => handleExpand('screenshot')} />
    </div>
  );
};

export default ExtensionSettings;
