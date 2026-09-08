import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorkflowRegistry } from '@chobits/workflow/core';

import { createEngine } from '../packages/workflow/engine';
import type { NodeHandler } from '../packages/workflow/types';

const TEST_NODE_ID = 'test/context-probe';

const getResourceProjectDirsMock = vi.fn(async () => null);

const handler: NodeHandler = {
  spec: {
    id: TEST_NODE_ID,
    label: 'Context Probe',
    inputs: [],
    outputs: []
  },
  run: async ({ ctx }) => {
    await ctx.getResourceProjectDirs?.('transcribe');
    return {};
  }
};

describe('WorkflowEngine context bridging', () => {
  beforeEach(() => {
    getResourceProjectDirsMock.mockReset();
    getResourceProjectDirsMock.mockResolvedValue(null);
  });

  it('passes workflow resource context into getResourceProjectDirs', async () => {
    const engine = createEngine(
      {
        getResourceProjectDirs: getResourceProjectDirsMock
      },
      { registry: createWorkflowRegistry({ nodes: [handler] }) }
    );

    const rec = await engine.run(
      {
        id: 'test:workflow-context',
        name: 'Workflow Context',
        nodes: [{ id: 'probe', type: TEST_NODE_ID }],
        edges: []
      },
      {
        resource: {
          id: 'resource-123'
        }
      },
      {
        workspaceId: 'workspace-456',
        folderId: 'folder-789'
      }
    );

    expect(rec.status).toBe('completed');
    expect(getResourceProjectDirsMock).toHaveBeenCalledTimes(1);
    expect(getResourceProjectDirsMock).toHaveBeenCalledWith('transcribe', {
      resourceId: 'resource-123',
      workspaceId: 'workspace-456',
      folderId: 'folder-789'
    });
  });
});
