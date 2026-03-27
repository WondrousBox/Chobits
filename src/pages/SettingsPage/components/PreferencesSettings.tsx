import React from 'react';

import { DownloaderSettings } from '@/features/download';

import AppearanceSettings from './AppearanceSettings';
import DatabaseBackupSettings from './DatabaseBackupSettings';
import FolderSetting from './FolderSetting';
import KeyManagementSettings from './KeyManagementSettings';
import MemoryManagementSettings from './MemoryManagementSettings';
import PreviewSettings from './PreviewSettings';

const PreferencesSettings: React.FC = () => {
  return (
    <div className="p-4 space-y-6">
      <AppearanceSettings />
      <PreviewSettings />
      <FolderSetting />
      <DownloaderSettings />
      <DatabaseBackupSettings />
      <MemoryManagementSettings />
      <KeyManagementSettings />
    </div>
  );
};

export default PreferencesSettings;
