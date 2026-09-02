import type { SpriteSpeakConfig } from '@packages/sprite-core/speak/types';
import { useCallback, useEffect, useState } from 'react';

export function useSpeakSettings() {
  const [config, setConfig] = useState<SpriteSpeakConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [cacheStats, setCacheStats] = useState<{ totalEntries: number; totalSizeBytes: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const speakConfig = await window.chobits.sprite.getSpeakConfig();
        if (!cancelled) setConfig(speakConfig);
        const stats = await window.chobits.sprite.getSpeakCacheStats();
        if (!cancelled) setCacheStats(stats);
      } catch (err) {
        console.error('加载语音配置失败:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = useCallback(async (partial: Partial<SpriteSpeakConfig>) => {
    try {
      const updated = await window.chobits.sprite.setSpeakConfig(partial);
      setConfig(updated);
    } catch (err) {
      console.error('更新语音配置失败:', err);
    }
  }, []);

  const handleTest = useCallback(async () => {
    if (isTesting) return;
    setIsTesting(true);
    try {
      await window.chobits.sprite.speak('你好，我是你的桌面精灵助手！');
    } catch (err) {
      console.error('测试语音失败:', err);
    } finally {
      setIsTesting(false);
    }
  }, [isTesting]);

  const handleClearCache = useCallback(async () => {
    try {
      await window.chobits.sprite.clearSpeakCache();
      const stats = await window.chobits.sprite.getSpeakCacheStats();
      setCacheStats(stats);
    } catch (err) {
      console.error('清空语音缓存失败:', err);
    }
  }, []);

  return { config, isLoading, isTesting, cacheStats, updateConfig, handleTest, handleClearCache };
}

export type SpeakSettingsState = ReturnType<typeof useSpeakSettings>;
