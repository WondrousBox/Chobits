import { ipcMain } from 'electron';

import type { SpritePurposeStartResult } from '../../../../packages/sprite-core/purpose';
import { createQuestListSnapshot, type QuestEngine, type QuestListSnapshot, type QuestRegistry, type QuestStartSource } from '../../../../packages/sprite-core/quest';

export interface QuestHandlersDeps {
  registry: QuestRegistry;
  engine: QuestEngine;
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
  ipcMain.handle('quest:start', async (_event, payload: { id: string; source?: QuestStartSource }): Promise<{ ok: boolean; snapshot?: QuestListSnapshot; startResult?: SpritePurposeStartResult | null; error?: string }> => {
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
  });
}
