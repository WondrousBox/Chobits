import fs from 'node:fs';
import path from 'node:path';

import { ipcMain, shell } from 'electron';

import { SpriteManager } from '../../../../packages/sprite-core/manager';
import type { SpritePurposeStartResult } from '../../../../packages/sprite-core/purpose';
import { createQuestListSnapshot, type QuestEngine, type QuestListSnapshot, type QuestRegistry, type QuestStartSource } from '../../../../packages/sprite-core/quest';
import { PreferencesStore } from '../preferences/preferences-store';

export interface QuestHandlersDeps {
  registry: QuestRegistry;
  engine: QuestEngine;
}

export interface QuestStorageLocation {
  file: string;
  dir: string;
  personaFile: string;
}

export interface QuestResetCompletedSummary {
  resetCount: number;
  resetQuestIds: string[];
  achievementIds: string[];
  rewardSources: string[];
}

export interface QuestResetProgressSummary {
  resetCount: number;
  resetQuestIds: string[];
  achievementIds: string[];
  rewardSources: string[];
}

function buildSnapshot(deps: QuestHandlersDeps): QuestListSnapshot {
  return createQuestListSnapshot({
    definitions: deps.registry.list(),
    state: deps.engine.getState()
  });
}

export function initQuestHandlers(deps: QuestHandlersDeps): void {
  ipcMain.removeHandler('quest:list');
  ipcMain.handle('quest:list', async () => {
    try {
      return { ok: true, snapshot: buildSnapshot(deps) };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.removeHandler('quest:start');
  ipcMain.handle(
    'quest:start',
    async (_event, payload: { id: string; source?: QuestStartSource }): Promise<{ ok: boolean; snapshot?: QuestListSnapshot; startResult?: SpritePurposeStartResult | null; error?: string }> => {
      try {
        const id = typeof payload?.id === 'string' ? payload.id.trim() : '';
        if (!id) {
          return { ok: false, snapshot: buildSnapshot(deps), error: 'Quest id is required' };
        }
        const source = payload?.source;
        const startResult = await deps.engine.startQuest(id, { source });
        return { ok: true, snapshot: buildSnapshot(deps), startResult };
      } catch (error) {
        return {
          ok: false,
          snapshot: buildSnapshot(deps),
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  );

  ipcMain.removeHandler('quest:getStorageLocation');
  ipcMain.handle('quest:getStorageLocation', async (): Promise<{ ok: boolean; location?: QuestStorageLocation; error?: string }> => {
    try {
      const preferencesLocation = PreferencesStore.getStoreLocation();
      return {
        ok: true,
        location: {
          file: preferencesLocation.file,
          dir: preferencesLocation.dir,
          personaFile: path.join(preferencesLocation.dir, 'persona-state.json')
        }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.removeHandler('quest:openStorageLocation');
  ipcMain.handle('quest:openStorageLocation', async (): Promise<{ ok: boolean; location?: QuestStorageLocation; error?: string }> => {
    try {
      const preferencesLocation = PreferencesStore.getStoreLocation();
      if (!fs.existsSync(preferencesLocation.dir)) {
        fs.mkdirSync(preferencesLocation.dir, { recursive: true });
      }

      if (fs.existsSync(preferencesLocation.file)) {
        shell.showItemInFolder(preferencesLocation.file);
      } else {
        const result = await shell.openPath(preferencesLocation.dir);
        if (result) return { ok: false, error: result };
      }

      return {
        ok: true,
        location: {
          file: preferencesLocation.file,
          dir: preferencesLocation.dir,
          personaFile: path.join(preferencesLocation.dir, 'persona-state.json')
        }
      };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.removeHandler('quest:resetCompleted');
  ipcMain.handle('quest:resetCompleted', async (): Promise<{ ok: boolean; snapshot?: QuestListSnapshot; summary?: QuestResetCompletedSummary; error?: string }> => {
    try {
      const result = await deps.engine.resetCompleted();
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      const removedAchievements = mgr?.removeAchievements(result.achievementIds) ?? [];
      const removedRewards = mgr?.removeClaimedRewards(result.rewardSources) ?? [];

      return {
        ok: true,
        snapshot: buildSnapshot(deps),
        summary: {
          resetCount: result.resetQuestIds.length,
          resetQuestIds: result.resetQuestIds,
          achievementIds: removedAchievements,
          rewardSources: removedRewards
        }
      };
    } catch (error) {
      return {
        ok: false,
        snapshot: buildSnapshot(deps),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.removeHandler('quest:resetProgress');
  ipcMain.handle('quest:resetProgress', async (): Promise<{ ok: boolean; snapshot?: QuestListSnapshot; summary?: QuestResetProgressSummary; error?: string }> => {
    try {
      const result = await deps.engine.resetProgress();
      const mgr = SpriteManager.hasInstance() ? SpriteManager.getInstance() : null;
      const removedAchievements = mgr?.removeAchievements(result.achievementIds) ?? [];
      const removedRewards = mgr?.removeClaimedRewards(result.rewardSources) ?? [];

      return {
        ok: true,
        snapshot: buildSnapshot(deps),
        summary: {
          resetCount: result.resetQuestIds.length,
          resetQuestIds: result.resetQuestIds,
          achievementIds: removedAchievements,
          rewardSources: removedRewards
        }
      };
    } catch (error) {
      return {
        ok: false,
        snapshot: buildSnapshot(deps),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
}
