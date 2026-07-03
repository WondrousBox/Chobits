import { ipcRenderer } from 'electron';

import type {
  CreateProjectInput,
  ExportedProjectData,
  ProjectAuditLog,
  ProjectCandidate,
  ProjectCandidateStatus,
  ProjectEvent,
  ProjectEventQuality,
  ProjectImpactPreview,
  ProjectMilestone,
  ProjectOrphanReport,
  ProjectPrivacySettings,
  ProjectReminderKind,
  ProjectReminderLink,
  ProjectReminderSuggestion,
  ProjectSnapshot,
  ProjectStatus,
  ProjectTrackingConfig,
  TrackedProject
} from '../../../packages/ai/services/project-tracking-types';

type LinkConversationParams = {
  confidence?: number;
  conversationId: string;
  createdBy?: 'user' | 'agent' | 'system';
  projectId: string;
  relationType?: string;
  strength?: number;
  workspaceId?: string;
};

type ProjectReminderPatch = {
  dueAt?: number | null;
  kind?: ProjectReminderKind;
  reason?: string | null;
  title?: string | null;
};

export const projectTrackingApi = {
  archiveProject: (projectId: string) =>
    ipcRenderer.invoke('projectTracking:archiveProject', projectId) as Promise<{
      error?: string;
      ok: boolean;
      project?: TrackedProject | null;
      snapshot?: ProjectSnapshot | null;
    }>,

  confirmCandidate: (candidateId: string, overrides?: Partial<CreateProjectInput>) =>
    ipcRenderer.invoke('projectTracking:confirmCandidate', candidateId, overrides) as Promise<{
      candidate?: ProjectCandidate | null;
      error?: string;
      ok: boolean;
      project?: TrackedProject;
      snapshot?: ProjectSnapshot | null;
    }>,

  createProject: (input: CreateProjectInput) =>
    ipcRenderer.invoke('projectTracking:createProject', input) as Promise<{
      error?: string;
      ok: boolean;
      project?: TrackedProject;
      snapshot?: ProjectSnapshot | null;
    }>,

  dismissCandidate: (candidateId: string) =>
    ipcRenderer.invoke('projectTracking:dismissCandidate', candidateId) as Promise<{
      candidate?: ProjectCandidate | null;
      error?: string;
      ok: boolean;
    }>,

  getConfig: () => ipcRenderer.invoke('projectTracking:getConfig') as Promise<{ config?: ProjectTrackingConfig; ok: boolean }>,

  getProject: (projectId: string) =>
    ipcRenderer.invoke('projectTracking:getProject', projectId) as Promise<{
      links: unknown[];
      project: TrackedProject;
      snapshot: ProjectSnapshot | null;
    } | null>,

  listCandidates: (params?: { conversationId?: string; limit?: number; offset?: number; status?: ProjectCandidateStatus[]; workspaceId?: string }) =>
    ipcRenderer.invoke('projectTracking:listCandidates', params) as Promise<ProjectCandidate[]>,

  listEvents: (params: { limit?: number; projectId: string; quality?: ProjectEventQuality[]; status?: string[]; type?: string[] }) =>
    ipcRenderer.invoke('projectTracking:listEvents', params) as Promise<ProjectEvent[]>,

  addEvent: (params: Partial<ProjectEvent> & { content: string; projectId: string; title: string; type: ProjectEvent['type']; workspaceId: string }) =>
    ipcRenderer.invoke('projectTracking:addEvent', params) as Promise<{ error?: string; event?: ProjectEvent; ok: boolean; snapshot?: ProjectSnapshot | null }>,

  updateEvent: (eventId: string, patch: Partial<ProjectEvent>) =>
    ipcRenderer.invoke('projectTracking:updateEvent', eventId, patch) as Promise<{ error?: string; event?: ProjectEvent | null; ok: boolean; snapshot?: ProjectSnapshot | null }>,

  reviewEvent: (eventId: string, quality: Extract<ProjectEventQuality, 'accepted' | 'rejected'>) =>
    ipcRenderer.invoke('projectTracking:reviewEvent', eventId, quality) as Promise<{ error?: string; event?: ProjectEvent | null; ok: boolean; snapshot?: ProjectSnapshot | null }>,

  listAuditLogs: (projectId: string, limit?: number) => ipcRenderer.invoke('projectTracking:listAuditLogs', projectId, limit) as Promise<ProjectAuditLog[]>,

  listReminderSuggestions: (projectId: string) => ipcRenderer.invoke('projectTracking:listReminderSuggestions', projectId) as Promise<ProjectReminderSuggestion[]>,

  listReminderLinks: (projectId: string, limit?: number) => ipcRenderer.invoke('projectTracking:listReminderLinks', projectId, limit) as Promise<ProjectReminderLink[]>,

  createReminderFromSuggestion: (projectId: string, suggestion: ProjectReminderSuggestion) =>
    ipcRenderer.invoke('projectTracking:createReminderFromSuggestion', projectId, suggestion) as Promise<{ error?: string; link?: ProjectReminderLink; ok: boolean }>,

  cancelReminder: (linkId: string) => ipcRenderer.invoke('projectTracking:cancelReminder', linkId) as Promise<{ error?: string; link?: ProjectReminderLink | null; ok: boolean }>,

  updateReminder: (linkId: string, patch: ProjectReminderPatch) =>
    ipcRenderer.invoke('projectTracking:updateReminder', linkId, patch) as Promise<{ error?: string; link?: ProjectReminderLink | null; ok: boolean }>,

  resyncReminder: (linkId: string) => ipcRenderer.invoke('projectTracking:resyncReminder', linkId) as Promise<{ error?: string; link?: ProjectReminderLink | null; ok: boolean }>,

  markReminderDone: (linkId: string) => ipcRenderer.invoke('projectTracking:markReminderDone', linkId) as Promise<{ error?: string; link?: ProjectReminderLink | null; ok: boolean }>,

  listMilestones: (params: { limit?: number; projectId: string }) => ipcRenderer.invoke('projectTracking:listMilestones', params) as Promise<ProjectMilestone[]>,

  addMilestone: (params: Partial<ProjectMilestone> & { projectId: string; title: string; workspaceId: string }) =>
    ipcRenderer.invoke('projectTracking:addMilestone', params) as Promise<{ error?: string; milestone?: ProjectMilestone; ok: boolean }>,

  updateMilestone: (milestoneId: string, patch: Partial<ProjectMilestone>) =>
    ipcRenderer.invoke('projectTracking:updateMilestone', milestoneId, patch) as Promise<{ error?: string; milestone?: ProjectMilestone | null; ok: boolean }>,

  listProjects: (params?: { includeDeleted?: boolean; limit?: number; offset?: number; status?: ProjectStatus[]; workspaceId?: string }) =>
    ipcRenderer.invoke('projectTracking:listProjects', params) as Promise<TrackedProject[]>,

  exportProject: (projectId: string) => ipcRenderer.invoke('projectTracking:exportProject', projectId) as Promise<{ data?: ExportedProjectData | null; error?: string; ok: boolean }>,

  previewProjectImpact: (projectId: string) => ipcRenderer.invoke('projectTracking:previewProjectImpact', projectId) as Promise<{ error?: string; ok: boolean; preview?: ProjectImpactPreview | null }>,

  inspectProjectOrphans: (projectId: string) => ipcRenderer.invoke('projectTracking:inspectProjectOrphans', projectId) as Promise<{ error?: string; ok: boolean; report?: ProjectOrphanReport | null }>,

  softDeleteProject: (projectId: string) => ipcRenderer.invoke('projectTracking:softDeleteProject', projectId) as Promise<{ error?: string; ok: boolean; project?: TrackedProject | null }>,

  restoreProject: (projectId: string) => ipcRenderer.invoke('projectTracking:restoreProject', projectId) as Promise<{ error?: string; ok: boolean; project?: TrackedProject | null }>,

  hardDeleteProject: (projectId: string) => ipcRenderer.invoke('projectTracking:hardDeleteProject', projectId) as Promise<{ error?: string; ok: boolean; removed?: number }>,

  mergeProjects: (sourceProjectId: string, targetProjectId: string) =>
    ipcRenderer.invoke('projectTracking:mergeProjects', sourceProjectId, targetProjectId) as Promise<{ error?: string; ok: boolean; source?: TrackedProject; target?: TrackedProject }>,

  splitProject: (input: { eventIds?: string[]; milestoneIds?: string[]; newProject: CreateProjectInput; sourceProjectId: string }) =>
    ipcRenderer.invoke('projectTracking:splitProject', input) as Promise<{ error?: string; ok: boolean; project?: TrackedProject | null }>,

  listLinksByTarget: (params: { limit?: number; targetId: string; targetType: string; workspaceId?: string }) => ipcRenderer.invoke('projectTracking:listLinksByTarget', params) as Promise<unknown[]>,

  linkConversation: (params: LinkConversationParams) => ipcRenderer.invoke('projectTracking:linkConversation', params) as Promise<{ error?: string; link?: unknown; ok: boolean }>,

  unlinkConversation: (params: { conversationId: string; projectId?: string; workspaceId?: string }) =>
    ipcRenderer.invoke('projectTracking:unlinkConversation', params) as Promise<{ error?: string; ok: boolean; removed?: number }>,

  searchProjects: (params: { limit?: number; query: string; workspaceId?: string }) => ipcRenderer.invoke('projectTracking:searchProjects', params) as Promise<TrackedProject[]>,

  setConfig: (patch: Partial<ProjectTrackingConfig>) => ipcRenderer.invoke('projectTracking:setConfig', patch) as Promise<{ config?: ProjectTrackingConfig; ok: boolean }>,

  rebuildSnapshot: (projectId: string) => ipcRenderer.invoke('projectTracking:rebuildSnapshot', projectId) as Promise<{ error?: string; ok: boolean; snapshot?: ProjectSnapshot | null }>,

  completeProject: (projectId: string, input?: { retrospective?: string | null; summary?: string | null }) =>
    ipcRenderer.invoke('projectTracking:completeProject', projectId, input) as Promise<{ error?: string; ok: boolean; project?: TrackedProject | null; snapshot?: ProjectSnapshot | null }>,

  reopenProject: (projectId: string) =>
    ipcRenderer.invoke('projectTracking:reopenProject', projectId) as Promise<{ error?: string; ok: boolean; project?: TrackedProject | null; snapshot?: ProjectSnapshot | null }>,

  generateCompletionSummary: (projectId: string) => ipcRenderer.invoke('projectTracking:generateCompletionSummary', projectId) as Promise<{ error?: string; ok: boolean; summary?: string }>,

  promoteRetrospectiveToMemory: (projectId: string, input?: { retrospective?: string | null; summary?: string | null }) =>
    ipcRenderer.invoke('projectTracking:promoteRetrospectiveToMemory', projectId, input) as Promise<{ error?: string; noteId?: string; ok: boolean; project?: TrackedProject | null }>,

  updatePrivacySettings: (projectId: string, patch: Partial<ProjectPrivacySettings>) =>
    ipcRenderer.invoke('projectTracking:updatePrivacySettings', projectId, patch) as Promise<{ error?: string; ok: boolean; project?: TrackedProject | null }>,

  updateProject: (projectId: string, patch: Partial<CreateProjectInput> & { status?: ProjectStatus }) =>
    ipcRenderer.invoke('projectTracking:updateProject', projectId, patch) as Promise<{
      error?: string;
      ok: boolean;
      project?: TrackedProject | null;
      snapshot?: ProjectSnapshot | null;
    }>
};
