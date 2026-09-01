import { describe, expect, it, vi } from 'vitest';

import { createWorkflowRegistry } from '../packages/workflow/core/registry';
import { ResourceLoadNode as CompatibilityResourceLoadNode } from '../packages/workflow/nodes/resource-load';
import { createWorkflowCapabilities } from '../packages/workflow/src/runtime/capabilities';
import { createWorkflowRuntime } from '../packages/workflow/src/runtime/runtime';
import { InMemoryWorkflowApplicationStore } from '../packages/workflow/src/testing/memory-store';
import { createWorkflowIntegrationResourceReadCapability } from '../packages/workflow-integrations/src/adapters/resource';
import { WORKFLOW_RESOURCE_READ } from '../packages/workflow-integrations/src/capabilities/resources';
import { ResourceLoadNode as PrivateResourceLoadNode } from '../packages/workflow-integrations/src/nodes/resource';

describe('workflow integration resource read extension', () => {
  it('delegates resource, folder, and workspace reads through fake ports', async () => {
    const ports = {
      resources: {
        getById: vi.fn(async (id: string) => ({ id })),
        list: vi.fn(async () => [{ id: 'resource-1' }])
      },
      folders: {
        list: vi.fn(async () => [{ id: 'folder-1' }])
      },
      workspaces: {
        getById: vi.fn(async (id: string) => ({ id, rootPath: '/workspace' }))
      }
    };
    const capability = createWorkflowIntegrationResourceReadCapability(ports);

    await expect(capability.resources.getById('resource-1')).resolves.toEqual({ id: 'resource-1' });
    await expect(capability.resources.list({ folderId: 'folder-1' }, 10, 2)).resolves.toEqual([{ id: 'resource-1' }]);
    await expect(capability.folders.list({ workspaceId: 'workspace-1' }, 20, 0)).resolves.toEqual([{ id: 'folder-1' }]);
    await expect(capability.workspaces.getById('workspace-1')).resolves.toEqual({ id: 'workspace-1', rootPath: '/workspace' });
    expect(ports.resources.list).toHaveBeenCalledWith({ folderId: 'folder-1' }, 10, 2);
    expect(ports.folders.list).toHaveBeenCalledWith({ workspaceId: 'workspace-1' }, 20, 0);
  });

  it('keeps the old node path while enforcing capability preflight', async () => {
    expect(CompatibilityResourceLoadNode).toBe(PrivateResourceLoadNode);
    const registry = createWorkflowRegistry({ nodes: [PrivateResourceLoadNode] });
    const request = {
      definition: {
        id: 'fixture:private-resource-read',
        name: 'Private resource read',
        nodes: [{ id: 'load', type: 'resource/load', inputDefaults: { resourceId: 'resource-1' } }],
        edges: []
      }
    };
    const missingRuntime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry,
      engineOptions: { completedRunTempTtlMs: 0 }
    });

    await expect(missingRuntime.validate(request)).resolves.toMatchObject({
      ok: false,
      missingCapabilities: [{ id: WORKFLOW_RESOURCE_READ.id, nodeIds: ['load'] }]
    });
    await missingRuntime.dispose();

    const resourceRead = createWorkflowIntegrationResourceReadCapability({
      resources: {
        getById: async (id) => ({ id, title: 'Private resource', filePath: '/workspace/example.md', mimeType: 'text/markdown', type: 'document' }),
        list: async () => []
      },
      folders: { list: async () => [] },
      workspaces: { getById: async () => undefined }
    });
    const runtime = createWorkflowRuntime({
      store: new InMemoryWorkflowApplicationStore(),
      registry,
      capabilities: createWorkflowCapabilities([[WORKFLOW_RESOURCE_READ, resourceRead]]),
      engineOptions: { completedRunTempTtlMs: 0 }
    });
    const record = await runtime.run(request);

    expect(record.status).toBe('completed');
    expect(record.output).toMatchObject({ resourceId: 'resource-1', name: 'Private resource', ext: '.md' });
    await runtime.dispose();
  });
});
