import React from 'react';

import AppearanceSettings from './AppearanceSettings';
import DatabaseBackupSettings from './DatabaseBackupSettings';
import FolderSetting from './FolderSetting';
import KeyManagementSettings from './KeyManagementSettings';
import LaunchAtLoginSettings from './LaunchAtLoginSettings';
import PreviewSettings from './PreviewSettings';
import UpdateSettings from './UpdateSettings';

const PreferencesSettings: React.FC = () => {
  return (
    <div className="p-4 space-y-6">
      <AppearanceSettings />
      <LaunchAtLoginSettings />
      <PreviewSettings />
      <FolderSetting />
      <DatabaseBackupSettings />
      <KeyManagementSettings />
      <UpdateSettings />
    </div>
  );
};

export default PreferencesSettings;
