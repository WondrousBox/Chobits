import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addResourcesFromDataTransfer, addResourcesFromSelectedFiles } from '../src/pages/ResourcePage/services/resourceService';

type ResourceApiMock = {
  'resource:add': ReturnType<typeof vi.fn>;
  uploadResourceFile: ReturnType<typeof vi.fn>;
  uploadResourceFileStreamStart: ReturnType<typeof vi.fn>;
  uploadResourceFileStreamChunk: ReturnType<typeof vi.fn>;
  uploadResourceFileStreamEnd: ReturnType<typeof vi.fn>;
};

describe('resource local path import', () => {
  let resource: ResourceApiMock;
  let getPathForFile: ReturnType<typeof vi.fn>;
  let previousWindow: unknown;

  beforeEach(() => {
    previousWindow = (globalThis as any).window;
    resource = {
      'resource:add': vi.fn(async ({ resource: input }) => ({
        success: true,
        data: { id: 'resource-1', type: 'file', ...input }
      })),
      uploadResourceFile: vi.fn(),
      uploadResourceFileStreamStart: vi.fn(),
      uploadResourceFileStreamChunk: vi.fn(),
      uploadResourceFileStreamEnd: vi.fn()
    };
    getPathForFile = vi.fn(() => '');
    (globalThis as any).window = {
      YUA: {
        file: { getPathForFile },
        resource
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = previousWindow;
    }
  });

  it('uses an explicit local path without uploading file contents', async () => {
    const file = {
      size: 12,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(12)),
      stream: vi.fn()
    } as unknown as File;

    const result = await addResourcesFromSelectedFiles([
      {
        path: 'F:/source/example.txt',
        localPath: 'F:/source/example.txt',
        relativePath: './example.txt',
        name: 'example.txt',
        size: 12,
        file
      }
    ]);

    expect(resource.uploadResourceFile).not.toHaveBeenCalled();
    expect(resource.uploadResourceFileStreamStart).not.toHaveBeenCalled();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.stream).not.toHaveBeenCalled();
    expect(resource['resource:add']).toHaveBeenCalledWith({
      resource: expect.objectContaining({ title: 'example.txt', filePath: 'F:/source/example.txt', sizeBytes: 12 }),
      requireManagedCopy: true
    });
    expect(result).toHaveLength(1);
  });

  it('uses the preload-resolved path when localPath was not pre-populated', async () => {
    const file = {
      size: 24,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(24))
    } as unknown as File;
    getPathForFile.mockReturnValue('F:/source/from-preload.pdf');

    await addResourcesFromSelectedFiles([
      {
        path: './from-preload.pdf',
        relativePath: './from-preload.pdf',
        name: 'from-preload.pdf',
        size: 24,
        file
      }
    ]);

    expect(getPathForFile).toHaveBeenCalledWith(file);
    expect(resource.uploadResourceFile).not.toHaveBeenCalled();
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(resource['resource:add']).toHaveBeenCalledWith({
      resource: expect.objectContaining({ filePath: 'F:/source/from-preload.pdf' }),
      requireManagedCopy: true
    });
  });

  it('uploads a synthetic file instead of treating its slash-prefixed relative path as local', async () => {
    const fileData = new ArrayBuffer(32);
    const file = {
      size: 32,
      arrayBuffer: vi.fn(async () => fileData)
    } as unknown as File;
    resource.uploadResourceFile.mockResolvedValue({
      success: true,
      filePath: 'F:/workspace/resources/synthetic.png',
      hash: 'hash-1'
    });

    await addResourcesFromSelectedFiles([
      {
        path: '/album/synthetic.png',
        relativePath: '/album/synthetic.png',
        name: 'synthetic.png',
        size: 32,
        file
      }
    ]);

    expect(getPathForFile).toHaveBeenCalledWith(file);
    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(resource.uploadResourceFile).toHaveBeenCalledWith({
      fileName: 'synthetic.png',
      data: fileData,
      workspaceId: undefined,
      folderId: undefined
    });
    expect(resource['resource:add']).toHaveBeenCalledWith({
      resource: expect.objectContaining({
        filePath: 'F:/workspace/resources/synthetic.png',
        metadata: JSON.stringify({ hashSha256: 'hash-1' })
      }),
      requireManagedCopy: false
    });
  });

  it('keeps the stream upload fallback for large synthetic files', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
    let chunkIndex = 0;
    const file = {
      size: 50 * 1024 * 1024 + 1,
      arrayBuffer: vi.fn(),
      stream: vi.fn(() => ({
        getReader: () => ({
          read: vi.fn(async () => {
            if (chunkIndex >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[chunkIndex++] };
          })
        })
      }))
    } as unknown as File;
    resource.uploadResourceFileStreamStart.mockResolvedValue({ success: true, uploadId: 'upload-1' });
    resource.uploadResourceFileStreamChunk.mockResolvedValue({ success: true });
    resource.uploadResourceFileStreamEnd.mockResolvedValue({ success: true, filePath: 'F:/workspace/resources/large.bin', hash: 'hash-large' });

    await addResourcesFromSelectedFiles([
      {
        path: './large.bin',
        relativePath: './large.bin',
        name: 'large.bin',
        size: 50 * 1024 * 1024 + 1,
        file
      }
    ]);

    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(file.stream).toHaveBeenCalledTimes(1);
    expect(resource.uploadResourceFileStreamStart).toHaveBeenCalledWith({
      fileName: 'large.bin',
      totalSize: 50 * 1024 * 1024 + 1,
      workspaceId: undefined,
      folderId: undefined
    });
    expect(resource.uploadResourceFileStreamChunk).toHaveBeenCalledTimes(2);
    expect(resource.uploadResourceFileStreamEnd).toHaveBeenCalledWith({ uploadId: 'upload-1' });
    expect(resource['resource:add']).toHaveBeenCalledWith({
      resource: expect.objectContaining({ filePath: 'F:/workspace/resources/large.bin' }),
      requireManagedCopy: false
    });
  });

  it('does not create a resource when the content upload fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const file = {
      size: 16,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(16))
    } as unknown as File;
    resource.uploadResourceFile.mockResolvedValue({ success: false, error: 'disk-full' });

    const result = await addResourcesFromSelectedFiles([
      {
        path: './failed.txt',
        relativePath: './failed.txt',
        name: 'failed.txt',
        size: 16,
        file
      }
    ]);

    expect(result).toEqual([]);
    expect(resource['resource:add']).not.toHaveBeenCalled();
  });

  it('returns no resource when the managed copy is rejected', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const file = {
      size: 12,
      arrayBuffer: vi.fn()
    } as unknown as File;
    resource['resource:add'].mockResolvedValue({ success: false, data: null, error: 'managed-copy-failed' });

    const result = await addResourcesFromSelectedFiles([
      {
        path: 'F:/source/rejected.txt',
        localPath: 'F:/source/rejected.txt',
        relativePath: './rejected.txt',
        name: 'rejected.txt',
        size: 12,
        file
      }
    ]);

    expect(result).toEqual([]);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(resource.uploadResourceFile).not.toHaveBeenCalled();
  });

  it('uses the upload fallback for pathless DataTransfer files', async () => {
    const file = {
      name: 'clipboard.png',
      size: 8,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(8))
    } as unknown as File;
    resource.uploadResourceFile.mockResolvedValue({ success: true, filePath: 'F:/workspace/resources/clipboard.png' });

    const dataTransfer = {
      items: [{ kind: 'file', getAsFile: () => file }]
    } as unknown as DataTransfer;

    const resources = await addResourcesFromDataTransfer(dataTransfer);

    expect(file.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(resource.uploadResourceFile).toHaveBeenCalledTimes(1);
    expect(resources).toHaveLength(1);
  });
});
