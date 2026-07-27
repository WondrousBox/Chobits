import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { CollectFolderTextsNode } from '../packages/workflow/nodes/collect-folder-texts';
import { GenerateLearningCardNode } from '../packages/workflow/nodes/generate-learning-card';
import { ResourceCreateNode } from '../packages/workflow/nodes/resource-create';
import { ResourceLoadNode } from '../packages/workflow/nodes/resource-load';
import { StartNode } from '../packages/workflow/nodes/start';
import { TextToImageNode } from '../packages/workflow/nodes/text-to-image';
import type { ExecutionContext, WorkflowHtmlScreenshotRequest } from '../packages/workflow/types';

const getPlugin = (): undefined => undefined;

describe('workflow node runtime services', () => {
  it('loads and enriches resources through the injected reader', async () => {
    const getById = vi.fn(async (id: string) => ({
      id,
      title: 'Loaded resource',
      filePath: '/missing/example.md',
      mimeType: 'text/markdown',
      type: 'document',
      contentText: 'loaded content'
    }));
    const ctx: ExecutionContext = {
      tmpDir: os.tmpdir(),
      services: {
        resources: { getById, list: async () => [] }
      }
    };

    const loaded = await ResourceLoadNode.run({ input: { resourceId: 'resource-1' }, ctx, emit: vi.fn(), getPlugin });
    const started = await StartNode.run({ input: { resource: { id: 'resource-1' } }, config: { inputMode: 'resource' }, ctx, emit: vi.fn(), getPlugin });

    expect(getById).toHaveBeenCalledTimes(2);
    expect(loaded).toMatchObject({ resourceId: 'resource-1', path: '/missing/example.md', contentText: 'loaded content' });
    expect(started).toMatchObject({ resource: { id: 'resource-1', title: 'Loaded resource' }, contentText: 'loaded content' });
  });

  it('collects descendant folder resources through injected readers', async () => {
    const listFolders = vi.fn(async () => [
      { id: 'root', parentId: null },
      { id: 'child', parentId: 'root' },
      { id: 'other', parentId: null }
    ]);
    const listResources = vi.fn(async (filter: Record<string, any>) =>
      filter.folderId === 'root' ? [{ id: 'a', description: 'Root description', contentText: 'Root content' }] : [{ id: 'b', contentText: 'Child content' }]
    );
    const ctx: ExecutionContext = {
      tmpDir: os.tmpdir(),
      workspaceId: 'workspace-1',
      folderId: 'root',
      services: {
        folders: { list: listFolders },
        resources: { getById: async () => undefined, list: listResources }
      }
    };

    const output = await CollectFolderTextsNode.run({ input: {}, ctx, emit: vi.fn(), getPlugin });

    expect(listFolders).toHaveBeenCalledWith({ workspaceId: 'workspace-1', deletedAt: 0 }, 10000, 0);
    expect(listResources.mock.calls.map(([filter]) => filter.folderId)).toEqual(['root', 'child']);
    expect(output).toEqual({ texts: '[描述] Root description\n\n[内容] Root content\n\n[内容] Child content', count: 2 });
  });

  it('resolves the workspace root through the injected reader before copying files', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workflow-node-services-'));
    try {
      const sourcePath = path.join(tempDir, 'source.txt');
      const workspaceRoot = path.join(tempDir, 'workspace');
      await fsPromises.writeFile(sourcePath, 'content');
      const getById = vi.fn(async () => ({ id: 'workspace-1', rootPath: workspaceRoot }));
      const emit = vi.fn((event: string, payload?: any) => {
        if (event === 'resource:create-request') payload.callback({ id: 'created-1', type: 'file', ...payload.resourceData });
      });

      const output = await ResourceCreateNode.run({
        input: { file: sourcePath },
        ctx: {
          tmpDir: tempDir,
          workspaceId: 'workspace-1',
          folderId: 'folder-1',
          services: { workspaces: { getById } }
        },
        emit,
        getPlugin
      });

      const copiedPath = path.join(workspaceRoot, 'resources', 'folders', 'folder-1', 'source.txt');
      expect(getById).toHaveBeenCalledWith('workspace-1');
      expect(output).toMatchObject({ resourceId: 'created-1', path: copiedPath });
      await expect(fsPromises.readFile(copiedPath, 'utf8')).resolves.toBe('content');
    } finally {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('delegates both image nodes to the injected HTML screenshot renderer', async () => {
    const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workflow-screenshot-services-'));
    const requests: WorkflowHtmlScreenshotRequest[] = [];
    const renderHtmlScreenshot = vi.fn(async (request: WorkflowHtmlScreenshotRequest) => {
      requests.push(request);
      for (const progress of [30, 50, 70, 80, 100]) request.onProgress?.(progress);
      return request.outputPath;
    });
    const emit = vi.fn();
    const ctx: ExecutionContext = { tmpDir: tempDir, services: { renderHtmlScreenshot } };

    try {
      await GenerateLearningCardNode.run({
        input: {
          vocabulary: [{ word: 'hello', level: 'A1', category: 'greeting', reason: 'common' }],
          sentences: [{ english: 'hello world', chinese: '你好，世界' }]
        },
        config: { width: 640 },
        ctx,
        emit,
        getPlugin
      });
      await TextToImageNode.run({ input: { text: '# Heading' }, config: { width: 720, height: 480 }, ctx, emit, getPlugin });

      expect(requests).toHaveLength(2);
      expect(requests[0]).toMatchObject({ width: 640, height: 800, contentHeightMode: 'exact' });
      expect(requests[0].html).toContain('English Learning Card');
      expect(requests[1]).toMatchObject({ width: 720, height: 480, contentHeightMode: 'expand' });
      expect(requests[1].html).toContain('<h1>Heading</h1>');
      expect(emit).toHaveBeenCalledWith('node:progress', { progress: 100, message: '完成' });
    } finally {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    }
  });
});
