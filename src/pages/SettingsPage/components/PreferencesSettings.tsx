import React from 'react';

import AppearanceSettings from './AppearanceSettings';
import FolderSetting from './FolderSetting';
import KeyManagementSettings from './KeyManagementSettings';

const PreferencesSettings: React.FC = () => {
  return (
    <div className=" space-y-3">
      <AppearanceSettings />
      <FolderSetting />
      <KeyManagementSettings />
    </div>
  );
};

export default PreferencesSettings;
