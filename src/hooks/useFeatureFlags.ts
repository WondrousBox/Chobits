import { FEATURE_DEFINITIONS, type FeatureKey, resolveFeatureFlags } from '@packages/common/feature-flags';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

/**
 * 全局功能旗标(渲染侧)
 *
 * - `isEnabled(key)`:读取某个功能是否启用,用于隐藏菜单 / 路由 / 入口
 * - `setFeatureFlag(key, enabled)`:更新开关;主进程的 handler / 窗口注册在启动时完成,
 *   切换后需重启应用才能完全生效
 */
export function useFeatureFlags(): {
  definitions: typeof FEATURE_DEFINITIONS;
  flags: Record<FeatureKey, boolean>;
  isLoading: boolean;
  isEnabled: (key: FeatureKey) => boolean;
  setFeatureFlag: (key: FeatureKey, enabled: boolean) => Promise<void>;
} {
  const [flags, setFlags] = useState<Record<FeatureKey, boolean>>(() => resolveFeatureFlags());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      try {
        const result = await window.chobits.preferences['preferences:get-config']();
        if (!disposed && result.ok && result.config) {
          setFlags(resolveFeatureFlags(result.config.featureFlags));
        }
      } catch (error) {
        console.warn('[FeatureFlags] failed to load feature flags:', error);
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      disposed = true;
    };
  }, []);

  const isEnabled = useCallback((key: FeatureKey): boolean => flags[key], [flags]);

  const setFeatureFlag = useCallback(
    async (key: FeatureKey, enabled: boolean): Promise<void> => {
      const previous = flags;
      const next = { ...flags, [key]: enabled };
      setFlags(next);
      try {
        const result = await window.chobits.preferences['preferences:set-config']({
          config: { featureFlags: next }
        });
        if (!result.ok) {
          throw new Error(result.error || '更新功能开关失败');
        }
      } catch (error) {
        setFlags(previous);
        toast.error('更新功能开关失败', {
          description: error instanceof Error ? error.message : String(error)
        });
      }
    },
    [flags]
  );

  return { definitions: FEATURE_DEFINITIONS, flags, isLoading, isEnabled, setFeatureFlag };
}
