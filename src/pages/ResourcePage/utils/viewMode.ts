import { ViewMode } from '../types';

export const ROOT_VIEW_MODE_KEY = 'resource-view-mode-root';
export const DEFAULT_VIEW_MODE: ViewMode = 'grid';
export const VIEW_MODE_OPTIONS = ['grid', 'list', 'detail', 'free'] as const;

export const isViewModeValue = (value: string | null | undefined): value is ViewMode => {
  if (!value) return false;
  return (VIEW_MODE_OPTIONS as readonly string[]).includes(value);
};

export const loadRootViewModePreference = (): ViewMode | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage?.getItem(ROOT_VIEW_MODE_KEY) ?? null;
    return isViewModeValue(stored) ? stored : null;
  } catch (err) {
    console.warn('read root view mode failed', err);
    return null;
  }
};

export const saveRootViewModePreference = (mode: ViewMode): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(ROOT_VIEW_MODE_KEY, mode);
  } catch (err) {
    console.warn('save root view mode failed', err);
  }
};
