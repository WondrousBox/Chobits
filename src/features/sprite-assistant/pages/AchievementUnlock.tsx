import React, { useCallback, useEffect, useState } from 'react';

import { getAchievementPresentation, type AchievementPresentation } from '../config/achievements';
import AchievementUnlockToast from '../ui/AchievementUnlockToast';

interface AchievementUnlockPayload {
  achievementId?: string;
}

type QueuedAchievement = AchievementPresentation & {
  toastKey: string;
};

const WINDOW_KEY = 'achievementUnlock';
const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 128;
const SCREEN_MARGIN = 20;
const DISPLAY_DURATION_MS = 5600;
const DUPLICATE_PAYLOAD_GUARD_MS = 750;

function readAchievementId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as AchievementUnlockPayload).achievementId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const AchievementUnlockPage: React.FC = () => {
  const [achievement, setAchievement] = useState<QueuedAchievement | null>(null);
  const activeAchievementRef = React.useRef<QueuedAchievement | null>(null);
  const queuedAchievementsRef = React.useRef<QueuedAchievement[]>([]);
  const isExitingRef = React.useRef(false);
  const closeAfterExitRef = React.useRef(false);
  const sequenceRef = React.useRef(0);
  const lastAcceptedPayloadRef = React.useRef<{ achievementId: string; acceptedAt: number } | null>(null);

  const closeWindow = useCallback((): void => {
    void window.YUA.window['window:close'](WINDOW_KEY as any);
  }, []);

  const setActiveAchievement = useCallback((nextAchievement: QueuedAchievement | null): void => {
    activeAchievementRef.current = nextAchievement;
    setAchievement(nextAchievement);
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

  const enqueueAchievement = useCallback(
    (achievementId: string): void => {
      const now = Date.now();
      const lastAcceptedPayload = lastAcceptedPayloadRef.current;
      if (lastAcceptedPayload?.achievementId === achievementId && now - lastAcceptedPayload.acceptedAt < DUPLICATE_PAYLOAD_GUARD_MS) {
        return;
      }
      lastAcceptedPayloadRef.current = { achievementId, acceptedAt: now };

      sequenceRef.current += 1;
      const nextAchievement: QueuedAchievement = {
        ...getAchievementPresentation(achievementId),
        toastKey: `${achievementId}:${sequenceRef.current}`
      };

      if (activeAchievementRef.current || isExitingRef.current) {
        queuedAchievementsRef.current = [...queuedAchievementsRef.current, nextAchievement];
        return;
      }

      setActiveAchievement(nextAchievement);
    },
    [setActiveAchievement]
  );

  const hydrateFromPayload = useCallback(async (incoming?: unknown): Promise<void> => {
    const payload = incoming ?? (await window.YUA.window['window:payload:get'](WINDOW_KEY as any));
    const achievementId = readAchievementId(payload);
    if (!achievementId) return;
    enqueueAchievement(achievementId);
  }, [enqueueAchievement]);

  const dismissCurrentAchievement = useCallback((): void => {
    if (!activeAchievementRef.current || isExitingRef.current) return;
    isExitingRef.current = true;
    closeAfterExitRef.current = true;
    setActiveAchievement(null);
  }, [setActiveAchievement]);

  const closeAllAchievements = useCallback((): void => {
    queuedAchievementsRef.current = [];
    closeAfterExitRef.current = true;

    if (!activeAchievementRef.current) {
      if (!isExitingRef.current) {
        closeWindow();
      }
      return;
    }

    dismissCurrentAchievement();
  }, [closeWindow, dismissCurrentAchievement]);

  const handleExitComplete = useCallback((): void => {
    if (!closeAfterExitRef.current) return;
    closeAfterExitRef.current = false;
    isExitingRef.current = false;

    const [nextAchievement, ...remainingAchievements] = queuedAchievementsRef.current;
    queuedAchievementsRef.current = remainingAchievements;
    if (nextAchievement) {
      setActiveAchievement(nextAchievement);
      return;
    }

    closeWindow();
  }, [closeWindow, setActiveAchievement]);

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
    const timer = window.setTimeout(dismissCurrentAchievement, DISPLAY_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [achievement?.toastKey, dismissCurrentAchievement]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent [background:transparent]">
      <AchievementUnlockToast achievement={achievement} durationMs={DISPLAY_DURATION_MS} onClose={closeAllAchievements} onExitComplete={handleExitComplete} />
    </div>
  );
};

export default AchievementUnlockPage;
