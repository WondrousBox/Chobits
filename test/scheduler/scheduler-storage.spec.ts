import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const userDataDir = vi.hoisted(() => '/tmp/chobits-scheduler-storage-test');

vi.mock('electron', () => ({
  app: {
    getPath: () => userDataDir
  }
}));

describe('scheduler storage', () => {
  beforeEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('persists owner pause state alongside scheduler runtime state', async () => {
    const { FileSchedulerStateStore } = await import('../../electron/main/scheduler');
    const store = new FileSchedulerStateStore();

    store.save({
      'job:one': {
        jobId: 'job:one',
        owner: 'owner.one',
        enabled: true,
        updatedAt: Date.parse('2026-05-05T09:00:00Z')
      }
    });
    store.saveOwnerPauseState({
      'sprite.behavior': {
        owner: 'sprite.behavior',
        paused: true,
        pausedAt: Date.parse('2026-05-05T09:00:00Z'),
        pauseReason: 'maintenance',
        updatedAt: Date.parse('2026-05-05T09:00:00Z')
      }
    });
    store.save({
      'job:one': {
        jobId: 'job:one',
        owner: 'owner.one',
        enabled: true,
        lastStatus: 'success',
        updatedAt: Date.parse('2026-05-05T09:01:00Z')
      }
    });

    expect(store.loadOwnerPauseState()).toEqual({
      'sprite.behavior': {
        owner: 'sprite.behavior',
        paused: true,
        pausedAt: Date.parse('2026-05-05T09:00:00Z'),
        pauseReason: 'maintenance',
        updatedAt: Date.parse('2026-05-05T09:00:00Z')
      }
    });
    expect(store.load()['job:one']).toMatchObject({
      jobId: 'job:one',
      owner: 'owner.one',
      lastStatus: 'success'
    });
  });

  it('cleans scheduler audit logs by retention days and maximum file count', async () => {
    const { FileSchedulerAuditLogStore } = await import('../../electron/main/scheduler');
    const dataDir = path.join(userDataDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    for (const date of ['2026-01-01', '2026-04-01', '2026-05-01', '2026-05-02']) {
      fs.writeFileSync(path.join(dataDir, `scheduler-audit-${date}.jsonl`), `${date}\n`, 'utf-8');
    }

    const store = new FileSchedulerAuditLogStore();
    const result = store.cleanup({
      now: Date.parse('2026-05-05T00:00:00Z'),
      retentionDays: 30,
      maxFiles: 2
    });

    expect(result.deletedFiles.map((filePath) => path.basename(filePath)).sort()).toEqual(['scheduler-audit-2026-01-01.jsonl', 'scheduler-audit-2026-04-01.jsonl']);
    expect(
      fs
        .readdirSync(dataDir)
        .filter((fileName) => fileName.startsWith('scheduler-audit-'))
        .sort()
    ).toEqual(['scheduler-audit-2026-05-01.jsonl', 'scheduler-audit-2026-05-02.jsonl']);
  });

  it('preserves the force marker when listing scheduler audit logs', async () => {
    const { FileSchedulerAuditLogStore } = await import('../../electron/main/scheduler');
    const store = new FileSchedulerAuditLogStore();
    const timestamp = Date.parse('2026-05-05T09:00:00Z');

    store.append({
      id: 'audit-force',
      eventType: 'run',
      owner: 'dailyCare',
      jobId: 'dailyCare:care:morning-brief:fixed:09-15',
      jobName: 'Morning Brief',
      trigger: 'manual',
      force: true,
      scheduledFor: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp + 10,
      status: 'success'
    });

    expect(store.list({ limit: 1 })).toEqual([
      expect.objectContaining({
        id: 'audit-force',
        force: true,
        status: 'success'
      })
    ]);
  });
});
