import React from 'react';

import DailyCareSettings from './DailyCareSettings';
import GeneralSettings from './GeneralSettings';
import MovementSettings from './MovementSettings';

const ExtensionSettings: React.FC = () => {
  return (
    <div className="space-y-1 px-2">
      <MovementSettings />
      <DailyCareSettings />
      <GeneralSettings />
    </div>
  );
};

export default ExtensionSettings;
