import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

type ThemeSource = 'system' | 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeSource;
  isDark: boolean;
  effectiveMode: 'light' | 'dark';
  setMode: (mode: ThemeSource) => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const applyDocumentTheme = (isDark: boolean): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;
  root.classList.toggle('dark', isDark);
};

const ensureThemeIpcRenderer = (): Window['chobits']['theme'] | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.chobits?.theme ?? null;
  } catch {
    return null;
  }
};

export const ThemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeSource>('system');
  const [isDark, setIsDark] = useState(false);

  const syncFromPayload = useCallback((payload: { themeSource?: ThemeSource; shouldUseDarkColors?: boolean } | null) => {
    if (!payload) return;
    if (payload.themeSource) {
      setModeState(payload.themeSource);
    }
    const dark = Boolean(payload.shouldUseDarkColors);
    setIsDark(dark);
    applyDocumentTheme(dark);
  }, []);

  const refreshTheme = useCallback(async () => {
    const bridge = ensureThemeIpcRenderer();
    if (!bridge) return;
    try {
      const response = await bridge['theme:get']();
      if (response?.ok) {
        syncFromPayload({
          themeSource: response.themeSource ?? 'system',
          shouldUseDarkColors: response.shouldUseDarkColors ?? false
        });
      }
    } catch (error) {
      console.warn('获取主题信息失败:', error);
    }
  }, [syncFromPayload]);

  useEffect(() => {
    (async () => {
      await refreshTheme();
    })();
    const bridge = ensureThemeIpcRenderer();
    if (!bridge) return;
    const dispose = bridge['theme:onChange']((payload) => syncFromPayload(payload));
    return () => {
      dispose?.();
    };
  }, [refreshTheme, syncFromPayload]);

  const handleSetMode = useCallback(
    async (nextMode: ThemeSource): Promise<void> => {
      const bridge = ensureThemeIpcRenderer();
      if (!bridge) return;
      if (nextMode === mode) return;
      try {
        await bridge['theme:set'](nextMode);
      } catch (error) {
        console.error('设置主题失败:', error);
      }
    },
    [mode]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark,
      effectiveMode: isDark ? 'dark' : 'light',
      setMode: handleSetMode
    }),
    [handleSetMode, isDark, mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useThemePreference = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useThemePreference 必须在 ThemeProvider 内使用');
  }
  return ctx;
};
