import { describe, expect, it, vi } from 'vitest';

const getWorkflowMock = vi.hoisted(() => vi.fn());
const listAllWorkflowDefinitionsMock = vi.hoisted(() => vi.fn());
const startWorkflowMock = vi.hoisted(() => vi.fn());

vi.mock('../../packages/workflow', () => ({
  getWorkflow: getWorkflowMock,
  listAllWorkflowDefinitions: listAllWorkflowDefinitionsMock,
  startWorkflow: startWorkflowMock
}));

vi.mock('../../packages/ai/runtime/pi/skills', () => ({
  resolveGuardedToolExecution: vi.fn()
}));

vi.mock('../../packages/common/db', () => ({
  WorkspacesRepo: {
    getDefault: vi.fn()
  }
}));

import { createPiWorkflowRunTool } from '../../packages/ai/runtime/pi/tools/workflow-run';

describe('workflowRunTool resource outputs', () => {
  it('normalizes a produced subtitle resource id for chained tool calls', async () => {
    getWorkflowMock.mockResolvedValue({
      id: 'sample:transcribe',
      name: 'Extract subtitles',
      nodes: [
        { id: 'start', type: 'core/start', config: { inputMode: 'resource', resourceKinds: ['video', 'audio'] } },
        { id: 'resource/create-subtitle', type: 'resource/create' },
        { id: 'end', type: 'core/end' }
      ],
      edges: []
    });
    startWorkflowMock.mockReturnValue({
      runId: 'run-1',
      workflowId: 'sample:transcribe',
      completionPromise: Promise.resolve({
        runId: 'run-1',
        workflowId: 'sample:transcribe',
        status: 'completed',
        duration: 1200,
        input: { resourceId: 'video-1' },
        metadata: { resourceId: 'video-1' },
        output: {
          result: 'subtitle-1'
        },
        nodes: {
          'resource/create-subtitle': {
            nodeId: 'resource/create-subtitle',
            status: 'completed',
            output: {
              resourceId: 'subtitle-1',
              ext: '.srt',
              kind: 'subtitle',
              name: 'video.srt',
              path: 'F:/workspace/video.srt',
              parentResourceId: 'video-1',
              resource: {
                id: 'subtitle-1',
                type: 'subtitle',
                title: 'video.srt'
              }
            }
          }
        }
      })
    });

    const toolContext = {
      resourcesRepo: {
        getById: vi.fn().mockResolvedValue({ id: 'video-1', workspaceId: 'workspace-1', folderId: 'folder-1' })
      },
      resolved: {}
    };
    const tool = createPiWorkflowRunTool(toolContext as any);

    const result = (await tool.execute('call-1', {
      action: 'run',
      workflowId: 'sample:transcribe',
      input: { resourceId: 'video-1' },
      waitForCompletion: true
    })).details as any;

    expect(result.success).toBe(true);
    expect(result.outputResourceId).toBe('subtitle-1');
    expect(result.outputResourceRole).toBe('subtitle');
    expect(result.next).toEqual({ resourceId: 'subtitle-1', resourceRole: 'subtitle' });
    expect(result.producedResourceIds).toEqual(['subtitle-1']);
    expect(result.createdResources[0]).toMatchObject({
      id: 'subtitle-1',
      ext: '.srt',
      kind: 'subtitle',
      parentResourceId: 'video-1',
      role: 'subtitle'
    });
  });
});
