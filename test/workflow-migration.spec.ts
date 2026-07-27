import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

describe('workflow workspace migration', () => {
  it('backfills custom, metadata-backed, and legacy preset runs', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE workspaces (id text PRIMARY KEY, is_default integer, deleted_at integer);
      CREATE TABLE workflows (id text PRIMARY KEY, workspace_id text);
      CREATE TABLE workflow_runs (
        id text PRIMARY KEY,
        workflow_id text,
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
      INSERT INTO workspaces VALUES ('workspace-default', 1, 0), ('workspace-custom', 0, 0), ('workspace-meta', 0, 0);
      INSERT INTO workflows VALUES ('custom-workflow', 'workspace-custom');
      INSERT INTO workflow_runs (id, workflow_id, status, metadata) VALUES
        ('custom-run', 'custom-workflow', 'completed', NULL),
        ('metadata-run', 'preset:metadata', 'completed', '{"workspaceId":"workspace-meta"}'),
        ('legacy-preset-run', 'preset:legacy', 'failed', NULL);
    `);

    const migrationPath = path.join(process.cwd(), 'drizzle', '0022_wealthy_jean_grey.sql');
    const statements = readFileSync(migrationPath, 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) db.exec(statement);

    const rows = db.prepare('SELECT id, workspace_id AS workspaceId FROM workflow_runs ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'custom-run', workspaceId: 'workspace-custom' },
      { id: 'legacy-preset-run', workspaceId: 'workspace-default' },
      { id: 'metadata-run', workspaceId: 'workspace-meta' }
    ]);
    db.close();
  });
});
