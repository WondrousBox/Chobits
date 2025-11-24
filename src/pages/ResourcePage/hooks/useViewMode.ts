import { useCallback, useEffect, useState } from 'react';

import { ViewMode } from '@/types';

import { createDefaultLayoutConfig, loadMasonryLayout, saveMasonryLayout } from '../utils/masonryLayout';
import { DEFAULT_VIEW_MODE, isViewModeValue, loadRootViewModePreference, saveRootViewModePreference } from '../utils/viewMode';

export const useViewMode = (
  folderFilter: string,
  currentFolderResourceIds: string[]
): { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void; handleViewModeChange: (mode: ViewMode) => void } => {
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW_MODE);

  // 加载视图模式偏好
  useEffect(() => {
    let cancelled = false;

    const applyPreferredViewMode = async (): Promise<void> => {
      if (!folderFilter) {
        const stored = loadRootViewModePreference();
        if (!cancelled) {
          setViewMode(stored ?? DEFAULT_VIEW_MODE);
        }
        return;
      }

      try {
        const config = await loadMasonryLayout(folderFilter);
        if (!cancelled) {
          // 如果之前保存的是 masonry 视图模式，回退到默认视图模式
          const savedViewMode = config?.viewMode;
          const validViewMode = savedViewMode && isViewModeValue(savedViewMode) ? savedViewMode : DEFAULT_VIEW_MODE;
          setViewMode(validViewMode);
          // 如果保存的是无效的视图模式，更新配置
          if (savedViewMode && !isViewModeValue(savedViewMode)) {
            const updatedConfig = { ...config, viewMode: validViewMode };
            await saveMasonryLayout(folderFilter, updatedConfig);
          }
        }
      } catch {
        if (!cancelled) {
          setViewMode(DEFAULT_VIEW_MODE);
        }
      }
    };

    applyPreferredViewMode();

    return () => {
      cancelled = true;
    };
  }, [folderFilter]);

  const persistViewMode = useCallback(
    async (mode: ViewMode) => {
      if (!folderFilter) {
        saveRootViewModePreference(mode);
        return;
      }
      try {
        let config = await loadMasonryLayout(folderFilter);
        if (!config) {
          config = createDefaultLayoutConfig(currentFolderResourceIds, mode);
        }
        const updatedConfig = { ...config, viewMode: mode };
        await saveMasonryLayout(folderFilter, updatedConfig);
      } catch (err) {
        console.warn('persist view mode failed', err);
      }
    },
    [folderFilter, currentFolderResourceIds]
  );

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode((prev) => {
        if (prev === mode) return prev;
        void persistViewMode(mode);
        return mode;
      });
    },
    [persistViewMode]
  );

  return {
    viewMode,
    setViewMode,
    handleViewModeChange
  };
};
