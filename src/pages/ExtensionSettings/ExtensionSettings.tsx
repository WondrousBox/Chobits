import React, { useState } from 'react';

import DailyCareSettings from './DailyCareSettings';
import DownloadResourceSettings from './DownloadResourceSettings';
import MovementSettings from './MovementSettings';
import SpriteSettings from './SpriteSettings';

type ExtensionPanel = 'movement' | 'dailyCare' | 'download' | 'sprite' | null;

const ExtensionSettings: React.FC = () => {
  const [activePanel, setActivePanel] = useState<ExtensionPanel>('movement');

  const handleExpand = (panel: ExtensionPanel): void => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  return (
    <div className="space-y-3 px-2">
      <MovementSettings expanded={activePanel === 'movement'} onExpand={() => handleExpand('movement')} />
      <DailyCareSettings expanded={activePanel === 'dailyCare'} onExpand={() => handleExpand('dailyCare')} />
      <DownloadResourceSettings expanded={activePanel === 'download'} onExpand={() => handleExpand('download')} />
      <SpriteSettings expanded={activePanel === 'sprite'} onExpand={() => handleExpand('sprite')} />
    </div>
  );
};

export default ExtensionSettings;
