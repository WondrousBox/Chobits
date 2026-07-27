import { describe, expect, it } from 'vitest';

import { createEngine } from '../packages/workflow/engine';
import { registerNode } from '../packages/workflow/registry';
import { MAX_WORKFLOW_LOG_ENTRIES, MAX_WORKFLOW_LOG_MESSAGE_LENGTH, sanitizeWorkflowRunRecord, sanitizeWorkflowValue } from '../packages/workflow/sanitize';
import type { WorkflowRunRecord } from '../packages/workflow/types';

describe('workflow data sanitization', () => {
  it('redacts sensitive fields and token patterns recursively', () => {
    const value = sanitizeWorkflowValue({
      apiKey: 'api-secret',
      nested: {
        access_token: 'access-secret',
        authorization: 'Bearer header-secret',
        url: 'https://example.test/path?api_key=query-secret&name=visible',
        message: 'request failed with Bearer message-secret'
      }
    }) as Record<string, any>;

    expect(value.apiKey).toBe('[REDACTED]');
    expect(value.nested.access_token).toBe('[REDACTED]');
    expect(value.nested.authorization).toBe('[REDACTED]');
    expect(value.nested.url).toBe('https://example.test/path?api_key=[REDACTED]&name=visible');
    expect(value.nested.message).toBe('request failed with Bearer [REDACTED]');
    expect(JSON.stringify(value)).not.toContain('secret');
  });

  it('bounds strings and collections and handles circular and binary values', () => {
    const circular: Record<string, unknown> = { name: 'root' };
    circular.self = circular;
    const value = sanitizeWorkflowValue(
      {
        text: 'x'.repeat(200),
        entries: Array.from({ length: 10 }, (_, index) => index),
        circular,
        binary: Buffer.alloc(32)
      },
      { maxStringLength: 64, maxArrayLength: 3, maxTotalChars: 1024 }
    ) as Record<string, any>;

    expect(value.text.length).toBeLessThanOrEqual(64);
    expect(value.entries).toEqual([0, 1, 2, '[Truncated 7 items]']);
    expect(value.circular.self).toBe('[Circular]');
    expect(value.binary).toBe('[Buffer 32 bytes]');
  });

  it('creates an immutable safe snapshot of a run record', () => {
    const record: WorkflowRunRecord = {
      runId: 'run-1',
      workflowId: 'workflow-1',
      createdAt: 1,
      status: 'running',
      input: { password: 'before', large: 'x'.repeat(300 * 1024) },
      output: { result: 'preserved' },
      nodes: { node: { nodeId: 'node', status: 'running', output: { token: 'node-secret' } } }
    };
    const snapshot = sanitizeWorkflowRunRecord(record);

    record.status = 'completed';
    record.nodes.node.status = 'completed';
    expect(snapshot.status).toBe('running');
    expect(snapshot.nodes.node.status).toBe('running');
    expect(snapshot.input?.password).toBe('[REDACTED]');
    expect(snapshot.nodes.node.output?.token).toBe('[REDACTED]');
    expect(snapshot.output).toEqual({ result: 'preserved' });
    expect(String(snapshot.input?.large).length).toBeLessThanOrEqual(16_384);
  });

  it('redacts and limits engine logs without changing internal run output', async () => {
    registerNode({
      spec: { id: 'test/sanitize-log', label: 'sanitize-log', inputs: [], outputs: [] },
      async run({ input }) {
        return { receivedFullValue: input.apiKey === 'internal-secret' };
      }
    });
    const workflowEngine = createEngine({}, { completedRunTempTtlMs: 0 });
    const rec = await workflowEngine.run(
      {
        id: 'test:sanitize-log',
        name: 'sanitize-log',
        nodes: [
          {
            id: 'node',
            type: 'test/sanitize-log',
            config: { clientSecret: 'config-secret' },
            inputDefaults: { apiKey: 'internal-secret', text: 'x'.repeat(MAX_WORKFLOW_LOG_MESSAGE_LENGTH * 2) }
          }
        ],
        edges: []
      },
      {}
    );
    const logs = workflowEngine.getRunLogs(rec.runId);

    expect(rec.output?.receivedFullValue).toBe(true);
    expect(logs.length).toBeLessThanOrEqual(MAX_WORKFLOW_LOG_ENTRIES);
    expect(logs.every((entry) => entry.message.length <= MAX_WORKFLOW_LOG_MESSAGE_LENGTH)).toBe(true);
    expect(logs.map((entry) => entry.message).join('\n')).not.toContain('internal-secret');
    expect(logs.map((entry) => entry.message).join('\n')).not.toContain('config-secret');
  });

  it('retains only the newest bounded number of log entries', async () => {
    registerNode({
      spec: { id: 'test/log-volume', label: 'log-volume', inputs: [], outputs: [] },
      async run() {
        return {};
      }
    });
    const workflowEngine = createEngine({}, { completedRunTempTtlMs: 0 });
    const rec = await workflowEngine.run({
      id: 'test:log-volume',
      name: 'log-volume',
      nodes: Array.from({ length: 180 }, (_, index) => ({ id: `node-${index}`, type: 'test/log-volume' })),
      edges: [],
      options: { concurrency: 16 }
    });

    expect(rec.status).toBe('completed');
    expect(workflowEngine.getRunLogs(rec.runId)).toHaveLength(MAX_WORKFLOW_LOG_ENTRIES);
  });
});
