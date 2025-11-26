import React from 'react';

import AppearanceSettings from './AppearanceSettings';
import FolderSetting from './FolderSetting';

const PreferencesSettings: React.FC = () => {
  return (
    <div className=" space-y-3">
      <AppearanceSettings />
      <FolderSetting />
    </div>
  );
};

export default PreferencesSettings;
