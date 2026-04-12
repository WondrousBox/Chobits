import { ipcRenderer } from 'electron';

export const memoryApi = {
  search: (params: { query: string; workspaceId: string; topicFilter?: string[]; dateRange?: { start?: string; end?: string }; maxResults?: number; includeContent?: boolean; debug?: boolean }) =>
    ipcRenderer.invoke('memory:search', params),

  get: (params: { noteId: string; section?: string; lineRange?: { start: number; end: number } }) => ipcRenderer.invoke('memory:get', params),

  topics: (params: { topicId?: string; action?: 'children' | 'related' | 'notes'; workspaceId?: string; limit?: number }) => ipcRenderer.invoke('memory:topics', params),

  listNotes: (params: { workspaceId: string; limit?: number; offset?: number }) => ipcRenderer.invoke('memory:listNotes', params),

  syncStatus: () => ipcRenderer.invoke('memory:syncStatus'),

  cancelSync: (jobId?: string) => ipcRenderer.invoke('memory:cancelSync', jobId),

  getMetrics: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:getMetrics', params),

  triggerSync: (params?: { workspaceId?: string; date?: string; conversationIds?: string[]; force?: boolean }) => ipcRenderer.invoke('memory:triggerSync', params),

  backfillRecallCues: (params?: { workspaceId?: string; noteIds?: string[]; limit?: number; providerId?: string; providerPresetId?: string }) =>
    ipcRenderer.invoke('memory:backfillRecallCues', params),

  rebuildIndex: () => ipcRenderer.invoke('memory:rebuildIndex'),

  validateIndex: (params?: { workspaceId?: string; issueLimit?: number }) => ipcRenderer.invoke('memory:validateIndex', params),

  deleteNote: (noteId: string) => ipcRenderer.invoke('memory:deleteNote', noteId),

  graphData: (params?: { topicId?: string; workspaceId?: string; includeNotes?: boolean; includeKeywords?: boolean; maxTopics?: number; maxEdges?: number; maxKeywords?: number }) =>
    ipcRenderer.invoke('memory:graphData', params),

  cleanupForConversations: (params: { conversationIds: string[] }) => ipcRenderer.invoke('memory:cleanupForConversations', params),

  clearAll: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:clearAll', params),

  stats: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:stats', params),

  clearRecallCache: (conversationId?: string) => ipcRenderer.invoke('memory:clearRecallCache', conversationId),

  getConfig: () => ipcRenderer.invoke('memory:getConfig'),

  setConfig: (patch: Record<string, unknown>) => ipcRenderer.invoke('memory:setConfig', patch),

  generateDailyIndex: (params: { date: string; workspaceId?: string }) => ipcRenderer.invoke('memory:generateDailyIndex', params),

  generateTopicArchives: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:generateTopicArchives', params),

  generateMemoryIndex: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:generateMemoryIndex', params)
};
