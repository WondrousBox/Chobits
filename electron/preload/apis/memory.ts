import { ipcRenderer } from 'electron';

export const memoryApi = {
  search: (params: { query: string; workspaceId: string; topicFilter?: string[]; dateRange?: { start?: string; end?: string }; maxResults?: number; includeContent?: boolean }) =>
    ipcRenderer.invoke('memory:search', params),

  get: (params: { noteId: string; section?: string; lineRange?: { start: number; end: number } }) => ipcRenderer.invoke('memory:get', params),

  topics: (params: { topicId?: string; action?: 'children' | 'related' | 'notes'; workspaceId?: string; limit?: number }) => ipcRenderer.invoke('memory:topics', params),

  listNotes: (params: { workspaceId: string; limit?: number; offset?: number }) => ipcRenderer.invoke('memory:listNotes', params),

  syncStatus: () => ipcRenderer.invoke('memory:syncStatus'),

  triggerSync: (params?: { workspaceId?: string; date?: string; conversationIds?: string[]; force?: boolean }) => ipcRenderer.invoke('memory:triggerSync', params),

  rebuildIndex: () => ipcRenderer.invoke('memory:rebuildIndex'),

  deleteNote: (noteId: string) => ipcRenderer.invoke('memory:deleteNote', noteId),

  graphData: (params?: { topicId?: string; workspaceId?: string; includeNotes?: boolean; maxTopics?: number; maxEdges?: number }) => ipcRenderer.invoke('memory:graphData', params),

  cleanupForConversations: (params: { conversationIds: string[] }) => ipcRenderer.invoke('memory:cleanupForConversations', params),

  clearAll: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:clearAll', params),

  stats: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:stats', params),

  clearRecallCache: (conversationId?: string) => ipcRenderer.invoke('memory:clearRecallCache', conversationId)
};
