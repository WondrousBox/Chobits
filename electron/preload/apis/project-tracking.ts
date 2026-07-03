import { ipcRenderer } from 'electron';

import type {
  CreateProjectInput,
  ProjectCandidate,
  ProjectCandidateStatus,
  ProjectEvent,
  ProjectMilestone,
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

  listEvents: (params: { limit?: number; projectId: string; status?: string[]; type?: string[] }) => ipcRenderer.invoke('projectTracking:listEvents', params) as Promise<ProjectEvent[]>,

  addEvent: (params: Partial<ProjectEvent> & { content: string; projectId: string; title: string; type: ProjectEvent['type']; workspaceId: string }) =>
    ipcRenderer.invoke('projectTracking:addEvent', params) as Promise<{ error?: string; event?: ProjectEvent; ok: boolean }>,

  updateEvent: (eventId: string, patch: Partial<ProjectEvent>) =>
    ipcRenderer.invoke('projectTracking:updateEvent', eventId, patch) as Promise<{ error?: string; event?: ProjectEvent | null; ok: boolean }>,

  listMilestones: (params: { limit?: number; projectId: string }) => ipcRenderer.invoke('projectTracking:listMilestones', params) as Promise<ProjectMilestone[]>,

  addMilestone: (params: Partial<ProjectMilestone> & { projectId: string; title: string; workspaceId: string }) =>
    ipcRenderer.invoke('projectTracking:addMilestone', params) as Promise<{ error?: string; milestone?: ProjectMilestone; ok: boolean }>,

  updateMilestone: (milestoneId: string, patch: Partial<ProjectMilestone>) =>
    ipcRenderer.invoke('projectTracking:updateMilestone', milestoneId, patch) as Promise<{ error?: string; milestone?: ProjectMilestone | null; ok: boolean }>,

  listProjects: (params?: { limit?: number; offset?: number; status?: ProjectStatus[]; workspaceId?: string }) =>
    ipcRenderer.invoke('projectTracking:listProjects', params) as Promise<TrackedProject[]>,

  listLinksByTarget: (params: { limit?: number; targetId: string; targetType: string; workspaceId?: string }) => ipcRenderer.invoke('projectTracking:listLinksByTarget', params) as Promise<unknown[]>,

  linkConversation: (params: LinkConversationParams) => ipcRenderer.invoke('projectTracking:linkConversation', params) as Promise<{ error?: string; link?: unknown; ok: boolean }>,

  unlinkConversation: (params: { conversationId: string; projectId?: string; workspaceId?: string }) =>
    ipcRenderer.invoke('projectTracking:unlinkConversation', params) as Promise<{ error?: string; ok: boolean; removed?: number }>,

  searchProjects: (params: { limit?: number; query: string; workspaceId?: string }) => ipcRenderer.invoke('projectTracking:searchProjects', params) as Promise<TrackedProject[]>,

  setConfig: (patch: Partial<ProjectTrackingConfig>) => ipcRenderer.invoke('projectTracking:setConfig', patch) as Promise<{ config?: ProjectTrackingConfig; ok: boolean }>,

  rebuildSnapshot: (projectId: string) => ipcRenderer.invoke('projectTracking:rebuildSnapshot', projectId) as Promise<{ error?: string; ok: boolean; snapshot?: ProjectSnapshot | null }>,

  updateProject: (projectId: string, patch: Partial<CreateProjectInput> & { status?: ProjectStatus }) =>
    ipcRenderer.invoke('projectTracking:updateProject', projectId, patch) as Promise<{
      error?: string;
      ok: boolean;
      project?: TrackedProject | null;
      snapshot?: ProjectSnapshot | null;
    }>
};
