import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../packages/common/db', () => ({
  addResource: vi.fn(),
  FoldersRepo: {
    getById: vi.fn()
  }
}));

import { listPiToolDescriptors, resolvePiToolId } from '../../packages/ai/runtime/pi/tool-registry';
import { searchToolbox } from '../../packages/ai/runtime/pi/toolbox';
import { createPiResourceCreateTool } from '../../packages/ai/runtime/pi/tools/resource-create';

const tempDirs: string[] = [];

function createToolContext() {
  return {
    chatRepo: {},
    conversationId: 'conversation-1',
    pushCardToWindows: vi.fn(),
    reportProgress: vi.fn(),
    resolved: {
      model: {
        providerId: 'minimax',
        presetId: 'preset-minimax'
      },
      request: {
        extras: {
          workspaceId: 'workspace-1'
        }
      }
    },
    resourcesRepo: {},
    targetWindowId: 42
  } as any;
}

describe('resourceCreateTool', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { force: true, recursive: true })));
  });

  it('is registered and discoverable through toolbox search', () => {
    expect(resolvePiToolId('resourceCreateTool')).toBe('resource-create');
    expect(listPiToolDescriptors().some((tool) => tool.id === 'resource-create')).toBe(true);

    const results = searchToolbox('创建资源');
    expect(results.some((skill) => skill.name === '资源查询与推送' && skill.tools.includes('resourceCreateTool'))).toBe(true);
  });

  it('creates a music resource with machine-readable music metadata and pushes a resource card', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'chobits-resource-create-'));
    tempDirs.push(dir);
    const filePath = path.join(dir, 'song.mp3');
    await fs.writeFile(filePath, 'audio');

    const createdResources: Record<string, any>[] = [];
    const resourceCreator = vi.fn(async (resource: Record<string, any>) => {
      createdResources.push(resource);
      return {
        data: {
          ...resource,
          id: 'resource-music-1'
        },
        success: true
      };
    });
    const toolContext = createToolContext();
    const tool = createPiResourceCreateTool(toolContext, { resourceCreator });

    const result = await tool.execute('call-resource-create-1', {
      aiGenerated: true,
      filePath,
      mediaKind: 'music',
      title: 'City Lights',
      type: 'audio'
    });

    expect(resourceCreator).toHaveBeenCalledOnce();
    expect(createdResources[0]).toMatchObject({
      filePath,
      sizeBytes: 5,
      title: 'City Lights',
      type: 'audio',
      workspaceId: 'workspace-1'
    });

    expect(JSON.parse(createdResources[0].metadata)).toMatchObject({
      aiGenerated: true,
      kind: 'music',
      mediaKind: 'music'
    });
    expect(JSON.parse(createdResources[0].tags)).toEqual(expect.arrayContaining(['music', 'ai-generated']));
    expect(JSON.parse(createdResources[0].categories)).toEqual(expect.arrayContaining(['music', 'ai-generated']));
    expect(toolContext.pushCardToWindows).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'resource-music-1',
        type: 'audio'
      }),
      42
    );
    expect((result.details as any)).toMatchObject({
      isMusic: true,
      resourceId: 'resource-music-1',
      success: true
    });
  });
});
