import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { WorkflowEngine } from '../packages/workflow/engine';
import type { WorkflowResourceEventAdapterPorts } from '../packages/workflow/resource-event-adapter';
import { attachWorkflowResourceEventAdapter } from '../packages/workflow/resource-event-adapter';
import { EngineEmitter } from '../packages/workflow/types';

function createContext(): { emitter: EngineEmitter; engine: WorkflowEngine; ports: WorkflowResourceEventAdapterPorts } {
  const emitter = new EngineEmitter();
  const engine = Object.assign(emitter, {
    updateRunContext: vi.fn(),
    getRunContext: vi.fn(() => ({ signal: new AbortController().signal }))
  }) as unknown as WorkflowEngine;
  const ports: WorkflowResourceEventAdapterPorts = {
    engine,
    addResource: vi.fn().mockResolvedValue({ data: { id: 'resource-new' } }),
    resources: {
      getById: vi.fn().mockResolvedValue({ id: 'resource-1' }),
      update: vi.fn().mockResolvedValue({ id: 'resource-1', title: 'Updated' })
    },
    folders: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined)
    },
    workspaces: {
      getById: vi.fn().mockResolvedValue({ id: 'workspace-1', rootPath: '/workspace' }),
      getDefault: vi.fn().mockResolvedValue({ id: 'workspace-1', rootPath: '/workspace' })
    },
    onResourceUpdated: vi.fn(),
    fetchFn: vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 })),
    createId: () => 'folder-new',
    currentDate: () => '2026-07-25',
    fileSystem: {
      mkdir: vi.fn(),
      exists: vi.fn().mockReturnValue(false),
      writeFile: vi.fn().mockResolvedValue(undefined)
    }
  };
  return { emitter, engine, ports };
}

describe('workflow resource event adapter', () => {
  it('bridges context, create, and update events through injected resource ports', async () => {
    const context = createContext();
    const dispose = attachWorkflowResourceEventAdapter(context.ports);
    const created = vi.fn();
    const updated = vi.fn();

    context.emitter.emit('wf:update-context', { __runId: 'run-1', workspaceId: 'workspace-1', folderId: 'folder-1' });
    context.emitter.emit('resource:create-request', {
      resourceData: { title: 'Created', filePath: '/tmp/file.txt', workspaceId: 'workspace-1', folderId: 'folder-1', ignored: true },
      callback: created
    });
    context.emitter.emit('resource:update-request', { resourceId: 'resource-1', patch: { title: 'Updated' }, callback: updated });

    await vi.waitFor(() => {
      expect(created).toHaveBeenCalledWith({ id: 'resource-new' });
      expect(updated).toHaveBeenCalledWith({ id: 'resource-1', title: 'Updated' });
    });
    expect(context.engine.updateRunContext).toHaveBeenCalledWith('run-1', { workspaceId: 'workspace-1', folderId: 'folder-1' });
    expect(context.ports.addResource).toHaveBeenCalledWith({
      resource: expect.objectContaining({ title: 'Created', filePath: '/tmp/file.txt', workspaceId: 'workspace-1', folderId: 'folder-1' })
    });
    expect(context.ports.resources.update).toHaveBeenCalledWith('resource-1', { title: 'Updated' });
    expect(context.ports.onResourceUpdated).toHaveBeenCalledWith({ id: 'resource-1', title: 'Updated' });

    dispose();
    expect(context.emitter.listenerCount('resource:create-request')).toBe(0);
    expect(context.emitter.listenerCount('resource:update-request')).toBe(0);
    expect(context.emitter.listenerCount('resource:download-request')).toBe(0);
  });

  it('downloads through injected fetch and filesystem ports and avoids filename collisions', async () => {
    const context = createContext();
    vi.mocked(context.ports.fileSystem!.exists).mockReturnValueOnce(true).mockReturnValueOnce(false);
    attachWorkflowResourceEventAdapter(context.ports);
    const callback = vi.fn();

    context.emitter.emit('resource:download-request', {
      url: 'https://example.com/media/video.mp4',
      workspaceId: 'workspace-1',
      folderId: 'folder-1',
      __runId: 'run-1',
      callback
    });

    const expectedPath = path.join('/workspace', 'resources', 'folders', 'folder-1', 'video(1).mp4');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(expectedPath));
    expect(context.ports.fetchFn).toHaveBeenCalledWith('https://example.com/media/video.mp4', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(context.ports.fileSystem!.writeFile).toHaveBeenCalledWith(expectedPath, expect.any(Uint8Array));
    expect(context.engine.updateRunContext).toHaveBeenCalledWith('run-1', { workspaceId: 'workspace-1', folderId: 'folder-1' });
  });

  it('creates and selects the daily folder when a download has no folder', async () => {
    const context = createContext();
    attachWorkflowResourceEventAdapter(context.ports);
    const callback = vi.fn();

    context.emitter.emit('resource:download-request', {
      url: 'https://example.com/report',
      workspaceId: 'workspace-1',
      __runId: 'run-1',
      callback
    });

    const expectedPath = path.join('/workspace', 'resources', 'folders', 'folder-new', 'report.tmp');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(expectedPath));
    expect(context.ports.folders.create).toHaveBeenCalledWith({ id: 'folder-new', name: '2026-07-25', parentId: null, workspaceId: 'workspace-1' });
    expect(context.engine.updateRunContext).toHaveBeenCalledWith('run-1', { workspaceId: 'workspace-1', folderId: 'folder-new' });
  });
});
