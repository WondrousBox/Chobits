import { ipcMain } from 'electron';

import { ConversationRouteEventRepo, ConversationRouteSnapshotRepo } from '../../db/conversation-route-repositories';
import { ChatRepo } from '../../db/repositories';
import { initConversationRouteEnricher } from './enricher';
import { rebuildConversationRoute, initConversationRouteWorker } from './worker';

export function initConversationRouteHandlers(): void {
  initConversationRouteEnricher();
  initConversationRouteWorker();

  ipcMain.handle('conversationRoute:getSnapshot', async (_event, conversationId: string) => {
    if (!conversationId) return null;
    return (await ConversationRouteSnapshotRepo.get(conversationId)) ?? null;
  });

  ipcMain.handle(
    'conversationRoute:listEvents',
    async (
      _event,
      params: {
        conversationId: string;
        limit?: number;
        offset?: number;
        status?: any;
        type?: any;
      }
    ) => {
      if (!params?.conversationId) return [];
      return ConversationRouteEventRepo.listByConversation(params.conversationId, {
        limit: params.limit,
        offset: params.offset,
        status: params.status,
        type: params.type
      });
    }
  );

  ipcMain.handle(
    'conversationRoute:searchEvents',
    async (
      _event,
      params: {
        conversationId?: string;
        workspaceId?: string;
        query: string;
        limit?: number;
      }
    ) => {
      if (!params?.query?.trim()) return [];
      return ConversationRouteEventRepo.search(params);
    }
  );

  ipcMain.handle('conversationRoute:updateEvent', async (_event, eventId: string, patch: any) => {
    if (!eventId) return null;
    const updated = await ConversationRouteEventRepo.update(eventId, patch || {});
    if (updated?.conversationId) {
      await ConversationRouteSnapshotRepo.recomputeFromEvents(updated.conversationId);
    }
    return updated ?? null;
  });

  ipcMain.handle('conversationRoute:rebuild', async (_event, conversationId: string) => {
    if (!conversationId) return { ok: false, error: 'conversationId is required' };
    const conversation = await ChatRepo.getConversation(conversationId);
    await rebuildConversationRoute(conversationId, {
      providerId: conversation?.providerId ?? undefined,
      providerPresetId: conversation?.providerPresetId ?? undefined
    });
    return {
      ok: true,
      snapshot: (await ConversationRouteSnapshotRepo.get(conversationId)) ?? null,
      events: await ConversationRouteEventRepo.listByConversation(conversationId, { limit: 100 })
    };
  });

  ipcMain.handle('conversationRoute:clear', async (_event, conversationId: string) => {
    if (!conversationId) return { ok: false, error: 'conversationId is required' };
    const eventsDeleted = await ConversationRouteEventRepo.deleteByConversation(conversationId);
    const snapshotsDeleted = await ConversationRouteSnapshotRepo.delete(conversationId);
    return { ok: true, eventsDeleted, snapshotsDeleted };
  });
}
