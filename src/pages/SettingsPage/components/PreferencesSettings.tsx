import React from 'react';

import AppearanceSettings from './AppearanceSettings';
import { DownloaderSettings } from '@/features/download';
import FolderSetting from './FolderSetting';
import KeyManagementSettings from './KeyManagementSettings';
import PreviewSettings from './PreviewSettings';

const PreferencesSettings: React.FC = () => {
  return (
    <div className="p-4 space-y-6">
      <AppearanceSettings />
      <PreviewSettings />
      <FolderSetting />
      <DownloaderSettings />
      <KeyManagementSettings />
    </div>
  );
};

export default PreferencesSettings;
