import { ACHIEVEMENT_UNLOCK_WINDOW_KEY } from '@packages/sprite-core/achievement-window';
import React, { useCallback, useEffect, useState } from 'react';

import { type AchievementPresentation, getAchievementPresentation } from '../config/achievements';
import AchievementUnlockToast from '../ui/AchievementUnlockToast';

interface AchievementUnlockPayload {
  achievementId?: string;
  debugDurationMs?: number;
}

type QueuedAchievement = AchievementPresentation & {
  toastKey: string;
};

const DISPLAY_DURATION_MS = 5600;
const DUPLICATE_PAYLOAD_GUARD_MS = 750;

function parseDebugDurationMs(value: unknown): number | null {
  const numericValue = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(numericValue)) return null;
  return Math.max(0, Math.round(numericValue));
}

function readAchievementId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as AchievementUnlockPayload).achievementId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readDebugDurationMs(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  return parseDebugDurationMs((payload as AchievementUnlockPayload).debugDurationMs);
}

function getHashSearchParams(): URLSearchParams {
  const hash = window.location.hash ?? '';
  const queryIndex = hash.indexOf('?');
  return new URLSearchParams(queryIndex >= 0 ? hash.slice(queryIndex + 1) : '');
}

function readDebugSearchParams(): { achievementId: string | null; durationMs: number | null } {
  const searchParams = new URLSearchParams(window.location.search ?? '');
  const hashSearchParams = getHashSearchParams();
  const debugAchievementId = searchParams.get('debugAchievementId')?.trim() || searchParams.get('achievementId')?.trim() || null;
  const hashDebugAchievementId = hashSearchParams.get('debugAchievementId')?.trim() || hashSearchParams.get('achievementId')?.trim() || null;
  const debugDurationMs = searchParams.get('debugDurationMs') ?? searchParams.get('durationMs') ?? hashSearchParams.get('debugDurationMs') ?? hashSearchParams.get('durationMs');
  return {
    achievementId: debugAchievementId ?? hashDebugAchievementId,
    durationMs: parseDebugDurationMs(debugDurationMs)
  };
}

function getWindowBridge(): Window['YUA']['window'] | null {
  return window.YUA?.window ?? null;
}

const AchievementUnlockPage: React.FC = () => {
  const [achievement, setAchievement] = useState<QueuedAchievement | null>(null);
  const [displayDurationMs, setDisplayDurationMs] = useState(DISPLAY_DURATION_MS);
  const activeAchievementRef = React.useRef<QueuedAchievement | null>(null);
  const queuedAchievementsRef = React.useRef<QueuedAchievement[]>([]);
  const isExitingRef = React.useRef(false);
  const closeAfterExitRef = React.useRef(false);
  const sequenceRef = React.useRef(0);
  const lastAcceptedPayloadRef = React.useRef<{ achievementId: string; acceptedAt: number } | null>(null);

  const closeWindow = useCallback((): void => {
    void getWindowBridge()?.['window:close'](ACHIEVEMENT_UNLOCK_WINDOW_KEY as any);
  }, []);

  const setActiveAchievement = useCallback((nextAchievement: QueuedAchievement | null): void => {
    activeAchievementRef.current = nextAchievement;
    setAchievement(nextAchievement);
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

  const hydrateFromPayload = useCallback(
    async (incoming?: unknown): Promise<boolean> => {
      const windowBridge = getWindowBridge();
      const payload = incoming ?? (windowBridge ? await windowBridge['window:payload:get'](ACHIEVEMENT_UNLOCK_WINDOW_KEY as any) : null);
      const debugDurationMs = readDebugDurationMs(payload);
      if (debugDurationMs !== null) {
        setDisplayDurationMs(debugDurationMs);
      }
      const achievementId = readAchievementId(payload);
      if (!achievementId) return false;
      enqueueAchievement(achievementId);
      return true;
    },
    [enqueueAchievement]
  );

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
    const debugParams = readDebugSearchParams();
    if (debugParams.durationMs !== null) {
      setDisplayDurationMs(debugParams.durationMs);
    }
    if (debugParams.achievementId) {
      enqueueAchievement(debugParams.achievementId);
    }
    void hydrateFromPayload();

    const handler = (_event: unknown, payload: unknown): void => {
      void hydrateFromPayload(payload);
    };
    window.ipcRenderer?.on('on:window:open:ready', handler as any);
    return () => {
      window.ipcRenderer?.off('on:window:open:ready', handler as any);
    };
  }, [enqueueAchievement, hydrateFromPayload]);

  useEffect(() => {
    if (!achievement) return undefined;
    if (displayDurationMs <= 0) return undefined;
    const timer = window.setTimeout(dismissCurrentAchievement, displayDurationMs);
    return () => window.clearTimeout(timer);
  }, [achievement?.toastKey, dismissCurrentAchievement, displayDurationMs]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-transparent [background:transparent]">
      <AchievementUnlockToast achievement={achievement} durationMs={displayDurationMs} onClose={closeAllAchievements} onExitComplete={handleExitComplete} />
    </div>
  );
};

export default AchievementUnlockPage;
