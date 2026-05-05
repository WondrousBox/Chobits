import { ipcRenderer } from 'electron';

import type { SchedulerAuditLogEntry, SchedulerAuditLogQuery, SchedulerJobSnapshot, SchedulerOwnerPauseState, SchedulerRuntimeState } from './types';

export type SchedulerIpcJobSnapshot = Omit<SchedulerJobSnapshot, 'definition'> & {
  definition: Omit<SchedulerJobSnapshot['definition'], 'payload'>;
};

export interface SchedulerBridgeType {
  listJobs(): Promise<SchedulerIpcJobSnapshot[]>;
  getJob(id: string): Promise<SchedulerIpcJobSnapshot | null>;
  getRuntimeState(): Promise<Record<string, SchedulerRuntimeState>>;
  getOwnerPauseState(): Promise<Record<string, SchedulerOwnerPauseState>>;
  triggerNow(id: string): Promise<SchedulerRuntimeState | null>;
  pauseJob(id: string, reason?: string): Promise<SchedulerIpcJobSnapshot | null>;
  resumeJob(id: string): Promise<SchedulerIpcJobSnapshot | null>;
  pauseOwner(owner: string, reason?: string): Promise<SchedulerIpcJobSnapshot[]>;
  resumeOwner(owner: string): Promise<SchedulerIpcJobSnapshot[]>;
  listAuditLog(query?: SchedulerAuditLogQuery): Promise<SchedulerAuditLogEntry[]>;
}

export const schedulerBridge: SchedulerBridgeType = {
  listJobs: () => ipcRenderer.invoke('scheduler:listJobs'),
  getJob: (id) => ipcRenderer.invoke('scheduler:getJob', id),
  getRuntimeState: () => ipcRenderer.invoke('scheduler:getRuntimeState'),
  getOwnerPauseState: () => ipcRenderer.invoke('scheduler:getOwnerPauseState'),
  triggerNow: (id) => ipcRenderer.invoke('scheduler:triggerNow', id),
  pauseJob: (id, reason) => ipcRenderer.invoke('scheduler:pauseJob', id, reason),
  resumeJob: (id) => ipcRenderer.invoke('scheduler:resumeJob', id),
  pauseOwner: (owner, reason) => ipcRenderer.invoke('scheduler:pauseOwner', owner, reason),
  resumeOwner: (owner) => ipcRenderer.invoke('scheduler:resumeOwner', owner),
  listAuditLog: (query) => ipcRenderer.invoke('scheduler:listAuditLog', query)
};
