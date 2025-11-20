import React from 'react';

import DailyCareSettings from './DailyCareSettings';
import DownloadResourceSettings from './DownloadResourceSettings';
import MovementSettings from './MovementSettings';

const ExtensionSettings: React.FC = () => {
  return (
    <div className="space-y-1 px-2">
      <MovementSettings />
      <DailyCareSettings />
      <DownloadResourceSettings />
    </div>
  );
};

export default ExtensionSettings;
