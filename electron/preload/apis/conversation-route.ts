import { ipcRenderer } from 'electron';

import type { ConversationRouteEvent, ConversationRouteEventStatus, ConversationRouteEventType, ConversationRouteSnapshot } from '../../../packages/ai/services/conversation-route-types';

export const conversationRouteApi = {
  clear: (conversationId: string) => ipcRenderer.invoke('conversationRoute:clear', conversationId) as Promise<{ ok: boolean; eventsDeleted?: number; snapshotsDeleted?: number; error?: string }>,

  getSnapshot: (conversationId: string) => ipcRenderer.invoke('conversationRoute:getSnapshot', conversationId) as Promise<ConversationRouteSnapshot | null>,

  listEvents: (params: {
    conversationId: string;
    limit?: number;
    offset?: number;
    status?: ConversationRouteEventStatus;
    type?: ConversationRouteEventType;
  }) => ipcRenderer.invoke('conversationRoute:listEvents', params) as Promise<ConversationRouteEvent[]>,

  rebuild: (conversationId: string) =>
    ipcRenderer.invoke('conversationRoute:rebuild', conversationId) as Promise<{
      ok: boolean;
      error?: string;
      events?: ConversationRouteEvent[];
      snapshot?: ConversationRouteSnapshot | null;
    }>,

  searchEvents: (params: { conversationId?: string; workspaceId?: string; query: string; limit?: number }) =>
    ipcRenderer.invoke('conversationRoute:searchEvents', params) as Promise<ConversationRouteEvent[]>,

  updateEvent: (eventId: string, patch: Partial<ConversationRouteEvent>) =>
    ipcRenderer.invoke('conversationRoute:updateEvent', eventId, patch) as Promise<ConversationRouteEvent | null>
};

