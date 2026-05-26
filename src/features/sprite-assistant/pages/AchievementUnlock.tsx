import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { getAchievementPresentation, type AchievementPresentation } from '../config/achievements';
import AchievementUnlockToast from '../ui/AchievementUnlockToast';

interface AchievementUnlockPayload {
  achievementId?: string;
}

const WINDOW_KEY = 'achievementUnlock';
const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 128;
const SCREEN_MARGIN = 20;
const DISPLAY_DURATION_MS = 5600;

function readAchievementId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as AchievementUnlockPayload).achievementId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const AchievementUnlockPage: React.FC = () => {
  const [achievement, setAchievement] = useState<AchievementPresentation | null>(null);
  const [sequence, setSequence] = useState(0);

  const closeWindow = useCallback((): void => {
    void window.YUA.window['window:close'](WINDOW_KEY as any);
  }, []);

  const positionWindow = useCallback(async (): Promise<void> => {
    try {
      const workArea = await window.YUA.window['screen:work-area:get'](WINDOW_KEY as any);
      await window.YUA.window['window:bounds:set'](WINDOW_KEY as any, {
        x: workArea.x + workArea.width - WINDOW_WIDTH - SCREEN_MARGIN,
        y: workArea.y + SCREEN_MARGIN,
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT
      });
    } catch (error) {
      console.warn('[AchievementUnlock] failed to position window:', error);
    }
  }, []);

  const hydrateFromPayload = useCallback(async (incoming?: unknown): Promise<void> => {
    const payload = incoming ?? (await window.YUA.window['window:payload:get'](WINDOW_KEY as any));
    const achievementId = readAchievementId(payload);
    if (!achievementId) return;
    setAchievement(getAchievementPresentation(achievementId));
    setSequence((current) => current + 1);
  }, []);

  useEffect(() => {
    void positionWindow();
    void hydrateFromPayload();

    const handler = (_event: unknown, payload: unknown): void => {
      void positionWindow();
      void hydrateFromPayload(payload);
    };
    window.ipcRenderer?.on('on:window:open:ready', handler as any);
    return () => {
      window.ipcRenderer?.off('on:window:open:ready', handler as any);
    };
  }, [hydrateFromPayload, positionWindow]);

  useEffect(() => {
    if (!achievement) return undefined;
    const timer = window.setTimeout(closeWindow, DISPLAY_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [achievement, sequence, closeWindow]);

  const keyedAchievement = useMemo(() => achievement && { ...achievement, id: `${achievement.id}:${sequence}` }, [achievement, sequence]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent">
      <AchievementUnlockToast achievement={keyedAchievement} durationMs={DISPLAY_DURATION_MS} onClose={closeWindow} />
    </div>
  );
};

export default AchievementUnlockPage;
