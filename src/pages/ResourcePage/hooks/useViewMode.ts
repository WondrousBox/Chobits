import { useCallback, useEffect, useState } from 'react';

import { ViewMode } from '../types';

export const VIEW_MODE_OPTIONS = ['grid', 'list', 'detail', 'free'] as const;

export const isViewModeValue = (value: string | null | undefined): value is ViewMode => {
  if (!value) return false;
  return (VIEW_MODE_OPTIONS as readonly string[]).includes(value);
};

export const ROOT_VIEW_MODE_KEY = 'resource-view-mode-root';
const saveRootViewModePreference = (mode: ViewMode): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(ROOT_VIEW_MODE_KEY, mode);
  } catch (err) {
    console.warn('save root view mode failed', err);
  }
};

const loadRootViewModePreference = (): ViewMode | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(ROOT_VIEW_MODE_KEY) ?? null;
    return isViewModeValue(stored) ? stored : null;
  } catch (err) {
    console.warn('read root view mode failed', err);
    return null;
  }
};

export const useViewMode = (folderFilter: string): { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void; handleViewModeChange: (mode: ViewMode) => void } => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // 加载视图模式偏好
  useEffect(() => {
    const stored = loadRootViewModePreference();
    setTimeout(() => {
      setViewMode(stored ?? 'grid');
    }, 0);
  }, [folderFilter]);

  const persistViewMode = useCallback(async (mode: ViewMode) => {
    saveRootViewModePreference(mode);
  }, []);

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
