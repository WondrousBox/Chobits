import { describe, expect, it, vi } from 'vitest';

const resolveGuardedToolExecutionMock = vi.hoisted(() => vi.fn());
const getVideoInfoMock = vi.hoisted(() => vi.fn());

const downloadManager = vi.hoisted(() => ({
  task: undefined as any,
  addTask: vi.fn(async () => 'download-1'),
  getTask: vi.fn(function (this: any) {
    return this.task;
  }),
  on: vi.fn(function (this: any) {
    return this;
  }),
  off: vi.fn(function (this: any) {
    return this;
  })
}));

vi.mock('../../packages/ai/runtime/pi/skills', () => ({
  resolveGuardedToolExecution: resolveGuardedToolExecutionMock
}));

vi.mock('../../electron/main/handlers/downloader', () => ({
  downloadManager,
  getVideoInfo: getVideoInfoMock
}));

import { createPiYoutubeDownloadTool } from '../../packages/ai/runtime/pi/tools/youtube-download';

describe('youtubeDownloadTool chain output', () => {
  it('returns a next resource id when the completed download created a resource', async () => {
    resolveGuardedToolExecutionMock.mockResolvedValue(undefined);
    getVideoInfoMock.mockResolvedValue({ title: 'Demo video', duration: 12 });
    downloadManager.task = {
      id: 'download-1',
      status: 'completed',
      result: {
        files: ['F:/workspace/demo.mp4'],
        thumbnails: [],
        resourceId: 'video-1',
        resource: {
          id: 'video-1',
          type: 'video',
          title: 'Demo video'
        }
      }
    };

    const tool = createPiYoutubeDownloadTool({ resolved: {} } as any);
    const result = (await tool.execute('call-1', {
      url: 'https://youtu.be/demo',
      waitForCompletion: true
    })).details as any;

    expect(result.success).toBe(true);
    expect(result.resourceId).toBe('video-1');
    expect(result.createdResource).toMatchObject({ id: 'video-1', type: 'video' });
    expect(result.next).toEqual({ resourceId: 'video-1', resourceRole: 'video' });
  });
});
