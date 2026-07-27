import { beforeEach, describe, expect, it, vi } from 'vitest';

const { completeTextMock, generateImageMock, generateLyricsMock, generateMusicMock, getAvailabilityMock, providerChatMock, streamTextMock, usageEventMock } = vi.hoisted(() => ({
  completeTextMock: vi.fn(),
  generateImageMock: vi.fn(),
  generateLyricsMock: vi.fn(),
  generateMusicMock: vi.fn(),
  getAvailabilityMock: vi.fn(),
  providerChatMock: vi.fn(),
  streamTextMock: vi.fn(),
  usageEventMock: vi.fn()
}));

vi.mock('../packages/ai/analytics/events', () => ({
  emitAiUsageObservedEvent: usageEventMock
}));

vi.mock('../packages/ai/preset-service', () => ({
  getPreset: vi.fn(),
  getPresetSecrets: vi.fn(async () => ({})),
  listPresets: vi.fn(() => [])
}));

vi.mock('../packages/ai/providers/service', () => ({
  getProviderCapabilities: vi.fn(() => ({})),
  listProviderDefinitions: vi.fn(() => []),
  listProviderRuntimeModels: vi.fn(async () => []),
  listProviderSecretKeys: vi.fn(() => ['apiKey'])
}));

vi.mock('../packages/ai/settings-store', () => ({
  getAllSecrets: vi.fn(async () => ({ apiKey: 'test-key' })),
  getFirstApiKey: vi.fn((value?: string) => value)
}));

vi.mock('../packages/ai/registry', () => ({
  getProvider: vi.fn(() => ({
    id: 'test-provider',
    label: 'Test Provider',
    chat: providerChatMock
  }))
}));

vi.mock('../packages/ai/runtime/pi/execution-service', () => ({
  PiExecutionService: class {
    completeText = completeTextMock;
    generateImage = generateImageMock;
    generateLyrics = generateLyricsMock;
    generateMusic = generateMusicMock;
    getAvailability = getAvailabilityMock;
    streamText = streamTextMock;
  }
}));

import {
  executeWorkflowChatRequest,
  executeWorkflowImageGenerationRequest,
  executeWorkflowLyricsGenerationRequest,
  executeWorkflowMusicGenerationRequest
} from '../packages/workflow/nodes/ai-workflow-utils';

describe('workflow AI request cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAvailabilityMock.mockReturnValue({ available: true });
    completeTextMock.mockResolvedValue('completed');
    streamTextMock.mockResolvedValue('streamed');
    generateImageMock.mockResolvedValue({ imageUrl: 'https://example.com/image.png' });
    generateMusicMock.mockResolvedValue({ artifacts: [], model: 'music', providerId: 'test-provider' });
    generateLyricsMock.mockResolvedValue({ lyrics: 'lyrics', model: 'music', providerId: 'test-provider' });
    providerChatMock.mockResolvedValue({ message: { content: 'legacy', role: 'assistant' }, providerId: 'test-provider' });
  });

  it('forwards the same signal through every Pi workflow request', async () => {
    const signal = new AbortController().signal;

    await executeWorkflowChatRequest({ messages: [{ role: 'user', content: 'hello' }], providerId: 'test-provider', signal });
    await executeWorkflowChatRequest({ messages: [{ role: 'user', content: 'stream' }], onDelta: vi.fn(), providerId: 'test-provider', signal });
    await executeWorkflowImageGenerationRequest({ prompt: 'image', providerId: 'test-provider', signal });
    await executeWorkflowMusicGenerationRequest({ model: 'music', prompt: 'music', providerId: 'test-provider', signal });
    await executeWorkflowLyricsGenerationRequest({ mode: 'text', prompt: 'lyrics', providerId: 'test-provider', signal });

    expect(completeTextMock).toHaveBeenCalledWith(expect.any(Object), signal);
    expect(streamTextMock).toHaveBeenCalledWith(expect.any(Object), expect.any(Function), signal);
    expect(generateImageMock).toHaveBeenCalledWith(expect.any(Object), signal);
    expect(generateMusicMock).toHaveBeenCalledWith(expect.any(Object), signal);
    expect(generateLyricsMock).toHaveBeenCalledWith(expect.any(Object), signal);
    expect(generateMusicMock.mock.calls[0][0]).not.toHaveProperty('signal');
    expect(generateLyricsMock.mock.calls[0][0]).not.toHaveProperty('signal');
  });

  it('forwards the signal to a legacy provider chat request', async () => {
    getAvailabilityMock.mockReturnValue({ available: false, reason: 'Pi unavailable' });
    const signal = new AbortController().signal;

    await executeWorkflowChatRequest({ messages: [{ role: 'user', content: 'legacy' }], providerId: 'test-provider', signal });

    expect(providerChatMock).toHaveBeenCalledWith(expect.any(Object), undefined, signal);
  });

  it('adds the workflow attempt to Pi request identity and analytics metadata', async () => {
    await executeWorkflowImageGenerationRequest({
      prompt: 'image',
      providerId: 'test-provider',
      workflowAiUsage: {
        operationKey: 'image',
        usageStage: 'generate',
        workflowAttempt: 3,
        workflowNodeId: 'image-node',
        workflowRunId: 'run-2'
      }
    });

    expect(generateImageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extras: expect.objectContaining({
          analyticsUsage: expect.objectContaining({ metadata: expect.objectContaining({ workflowAttempt: 3 }) }),
          requestId: 'run-2:image-node:attempt-3:image'
        })
      }),
      undefined
    );
  });

  it('records an aborted legacy provider request as cancelled', async () => {
    getAvailabilityMock.mockReturnValue({ available: false, reason: 'Pi unavailable' });
    const controller = new AbortController();
    controller.abort();
    const error = new Error('aborted');
    error.name = 'AbortError';
    providerChatMock.mockRejectedValueOnce(error);

    await expect(
      executeWorkflowChatRequest({
        messages: [{ role: 'user', content: 'cancel me' }],
        providerId: 'test-provider',
        signal: controller.signal,
        workflowAiUsage: {
          operationKey: 'chat',
          usageStage: 'generate',
          workflowAttempt: 2,
          workflowNodeId: 'node-1',
          workflowRunId: 'run-1'
        }
      })
    ).rejects.toBe(error);

    expect(usageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptIndex: 1,
        requestId: 'run-1:node-1:attempt-2:chat',
        status: 'cancelled',
        metadata: expect.objectContaining({ workflowAttempt: 2 })
      }),
      { producer: 'WorkflowAI' }
    );
  });
});
