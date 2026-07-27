import { createRequire } from 'node:module';

import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

const { getOrmMock } = vi.hoisted(() => ({
  getOrmMock: vi.fn()
}));

vi.mock('../packages/common/db', async () => ({
  getOrm: getOrmMock,
  Schema: await import('../electron/main/db/schema')
}));

import { WorkflowStore } from '../packages/workflow/store';

describe('WorkflowStore run retention', () => {
  let sqlite: InstanceType<typeof DatabaseSync> | undefined;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
      CREATE TABLE workflow_runs (
        id text PRIMARY KEY NOT NULL,
        workflow_id text,
        workspace_id text,
        status text NOT NULL,
        input text,
        output text,
        error text,
        nodes text,
        metadata text,
        duration integer,
        started_at integer,
        completed_at integer
      );
    `);
    getOrmMock.mockReturnValue(
      drizzle(async (sql, params, method) => {
        const statement = sqlite!.prepare(sql);
        statement.setReturnArrays(true);
        if (method === 'run') {
          statement.run(...params);
          return { rows: [] };
        }
        if (method === 'get') return { rows: statement.get(...params) as any };
        return { rows: statement.all(...params) as any[] };
      })
    );
  });

  afterEach(() => {
    sqlite?.close();
    sqlite = undefined;
    getOrmMock.mockReset();
  });

  it('deletes only expired or overflowing terminal runs in the requested workspace', async () => {
    const insert = sqlite!.prepare('INSERT INTO workflow_runs (id, workspace_id, status, started_at) VALUES (?, ?, ?, ?)');
    insert.run('expired-completed', 'workspace-1', 'completed', 100);
    insert.run('missing-start', 'workspace-1', 'failed', null);
    insert.run('active-running', 'workspace-1', 'running', 100);
    insert.run('newest-completed', 'workspace-1', 'completed', 900);
    insert.run('newest-failed', 'workspace-1', 'failed', 800);
    insert.run('overflow-canceled', 'workspace-1', 'canceled', 700);
    insert.run('overflow-completed', 'workspace-1', 'completed', 600);
    insert.run('other-workspace-expired', 'workspace-2', 'completed', 100);

    await expect(
      WorkflowStore.pruneRuns('workspace-1', {
        asOf: 1000,
        batchSize: 2,
        maxAgeMs: 500,
        maxRunsPerWorkspace: 2
      })
    ).resolves.toBe(4);

    const remaining = sqlite!.prepare('SELECT id FROM workflow_runs ORDER BY id').all() as Array<{ id: string }>;
    expect(remaining.map((row) => row.id)).toEqual(['active-running', 'newest-completed', 'newest-failed', 'other-workspace-expired']);
  });
});
