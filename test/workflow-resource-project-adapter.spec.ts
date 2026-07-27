import { describe, expect, it, vi } from 'vitest';

import { createWorkflowResourceProjectResolver } from '../packages/workflow/resource-project-adapter';

describe('workflow resource project adapter', () => {
  it('returns null without a complete resource scope', async () => {
    const ensure = vi.fn();
    const resolve = createWorkflowResourceProjectResolver({ ensure });

    await expect(resolve('transcribe')).resolves.toBeNull();
    await expect(resolve('transcribe', { resourceId: 'resource-1' })).resolves.toBeNull();
    await expect(resolve('transcribe', { workspaceId: 'workspace-1' })).resolves.toBeNull();
    expect(ensure).not.toHaveBeenCalled();
  });

  it('maps the application resource project service to execution context directories', async () => {
    const ensure = vi.fn(async () => ({
      path: '/workspace/projects/resource-1.resproject',
      subDirs: {
        outputs: '/workspace/projects/resource-1.resproject/outputs',
        cache: '/workspace/projects/resource-1.resproject/cache',
        temp: '/workspace/projects/resource-1.resproject/temp',
        data: '/workspace/projects/resource-1.resproject/data'
      }
    }));
    const resolve = createWorkflowResourceProjectResolver({ ensure });

    await expect(resolve('transcribe', { resourceId: 'resource-1', workspaceId: 'workspace-1', folderId: 'folder-1' })).resolves.toEqual({
      isResource: true,
      resourceId: 'resource-1',
      workspaceId: 'workspace-1',
      outputsDir: '/workspace/projects/resource-1.resproject/outputs',
      cacheDir: '/workspace/projects/resource-1.resproject/cache',
      tempDir: '/workspace/projects/resource-1.resproject/temp',
      dataDir: '/workspace/projects/resource-1.resproject/data'
    });
    expect(ensure).toHaveBeenCalledWith('resource-1', 'workspace-1');
  });

  it('preserves a missing workspace project as a non-resource task', async () => {
    const ensure = vi.fn(async () => null);
    const resolve = createWorkflowResourceProjectResolver({ ensure });

    await expect(resolve('transcribe', { resourceId: 'resource-1', workspaceId: 'workspace-missing' })).resolves.toBeNull();
  });
});
