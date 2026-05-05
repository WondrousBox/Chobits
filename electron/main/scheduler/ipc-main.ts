import { ipcMain } from 'electron';

import { getMainSchedulerService } from './singleton';
import type { SchedulerAuditLogQuery, SchedulerJobSnapshot } from './types';

type SchedulerIpcJobSnapshot = Omit<SchedulerJobSnapshot, 'definition'> & {
  definition: Omit<SchedulerJobSnapshot['definition'], 'payload'>;
};

function sanitizeSnapshot(snapshot: SchedulerJobSnapshot): SchedulerIpcJobSnapshot {
  const definition = { ...snapshot.definition };
  delete (definition as { payload?: unknown }).payload;
  return {
    ...snapshot,
    definition
  };
}

export function initSchedulerIPC(): void {
  ipcMain.handle('scheduler:listJobs', () => {
    return getMainSchedulerService().listJobs().map(sanitizeSnapshot);
  });

  ipcMain.handle('scheduler:getJob', (_event, id: string) => {
    const job = getMainSchedulerService().getJob(id);
    return job ? sanitizeSnapshot(job) : null;
  });

  ipcMain.handle('scheduler:getRuntimeState', () => {
    return getMainSchedulerService().getRuntimeState();
  });

  ipcMain.handle('scheduler:getOwnerPauseState', () => {
    return getMainSchedulerService().getOwnerPauseState();
  });

  ipcMain.handle('scheduler:triggerNow', async (_event, id: string) => {
    return getMainSchedulerService().triggerNow(id);
  });

  ipcMain.handle('scheduler:pauseJob', (_event, id: string, reason?: string) => {
    const snapshot = getMainSchedulerService().pauseJob(id, reason);
    return snapshot ? sanitizeSnapshot(snapshot) : null;
  });

  ipcMain.handle('scheduler:resumeJob', (_event, id: string) => {
    const snapshot = getMainSchedulerService().resumeJob(id);
    return snapshot ? sanitizeSnapshot(snapshot) : null;
  });

  ipcMain.handle('scheduler:pauseOwner', (_event, owner: string, reason?: string) => {
    return getMainSchedulerService().pauseOwner(owner, reason).map(sanitizeSnapshot);
  });

  ipcMain.handle('scheduler:resumeOwner', (_event, owner: string) => {
    return getMainSchedulerService().resumeOwner(owner).map(sanitizeSnapshot);
  });

  ipcMain.handle('scheduler:listAuditLog', (_event, query?: SchedulerAuditLogQuery) => {
    return getMainSchedulerService().listAuditLog(query);
  });
}
