import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  chatEphemeralMock,
  chatStreamMock,
  emitAiUsageObservedEventMock,
  getAllSecretsMock,
  getFirstApiKeyMock,
  getPresetMock,
  getPresetSecretsMock,
  getProviderDefinitionDefaultModelMock,
  getProviderMock,
  listProviderSecretKeysMock,
  resolveKnownProviderIdMock,
  resolveUsablePresetMock,
  supportsProviderCapabilityMock,
  toCanonicalProviderIdMock
} = vi.hoisted(() => ({
  chatEphemeralMock: vi.fn(),
  chatStreamMock: vi.fn(),
  emitAiUsageObservedEventMock: vi.fn(),
  getAllSecretsMock: vi.fn(),
  getFirstApiKeyMock: vi.fn(),
  getPresetMock: vi.fn(),
  getPresetSecretsMock: vi.fn(),
  getProviderDefinitionDefaultModelMock: vi.fn(),
  getProviderMock: vi.fn(),
  listProviderSecretKeysMock: vi.fn(),
  resolveKnownProviderIdMock: vi.fn(),
  resolveUsablePresetMock: vi.fn(),
  supportsProviderCapabilityMock: vi.fn(),
  toCanonicalProviderIdMock: vi.fn()
}));

vi.mock('../packages/ai/analytics/events', () => ({
  emitAiUsageObservedEvent: emitAiUsageObservedEventMock
}));

vi.mock('../electron/main/logger', () => ({
  __esModule: true,
  default: class Logger {},
  binPathLog: vi.fn(),
  devLog: vi.fn(),
  logger: {
    log: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn()
    }
  }
}));

vi.mock('@packages/common/db', () => ({}), { virtual: true });

vi.mock('../packages/ai/preset-service', () => ({
  getPreset: getPresetMock,
  getPresetSecrets: getPresetSecretsMock,
  resolveUsablePreset: resolveUsablePresetMock
}));

vi.mock('../packages/ai/providers/service', () => ({
  getProviderDefinitionDefaultModel: getProviderDefinitionDefaultModelMock,
  listProviderSecretKeys: listProviderSecretKeysMock,
  resolveKnownProviderId: resolveKnownProviderIdMock,
  supportsProviderCapability: supportsProviderCapabilityMock,
  toCanonicalProviderId: toCanonicalProviderIdMock
}));

vi.mock('../packages/ai/registry', () => ({
  getProvider: getProviderMock
}));

vi.mock('../packages/ai/settings-store', () => ({
  getAllSecrets: getAllSecretsMock,
  getFirstApiKey: getFirstApiKeyMock
}));

vi.mock('../packages/ai/runtime/pi/session-service', () => ({
  PiSessionService: class {
    chatEphemeral = chatEphemeralMock;
    chatStream = chatStreamMock;

    getAvailability(): { available: boolean; reason: string } {
      return { available: true, reason: '' };
    }
  }
}));

import { PiExecutionService } from '../packages/ai/runtime/pi/execution-service';
import type { SpeechSynthesisRequest } from '../packages/ai/types';

describe('PiExecutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    chatEphemeralMock.mockResolvedValue({ message: { content: 'completed', role: 'assistant' } });
    chatStreamMock.mockImplementation(async (_request, emit) => {
      emit({ type: 'delta', data: { text: 'streamed' } });
      emit({ type: 'message_completed', data: { message: { content: 'streamed', role: 'assistant' }, usage: { totalTokens: 3 } } });
    });

    toCanonicalProviderIdMock.mockImplementation((providerId?: string) => providerId || '');
    resolveKnownProviderIdMock.mockImplementation((providerId: string) => providerId);
    listProviderSecretKeysMock.mockReturnValue(['apiKey', 'baseUrl']);
    getProviderDefinitionDefaultModelMock.mockReturnValue('speech-2.8-turbo');
    getAllSecretsMock.mockResolvedValue({});
    getFirstApiKeyMock.mockImplementation((value: string | undefined) => value);
    supportsProviderCapabilityMock.mockReturnValue(true);
  });

  it('records streaming workflow text with the same attempt identity', async () => {
    const request = {
      extras: {
        analyticsUsage: {
          metadata: { workflowAttempt: 3 },
          operationKey: 'chat',
          sourceId: 'node-1',
          sourceType: 'workflow',
          usageCategory: 'workflow',
          usageFeature: 'workflow_ai',
          usageStage: 'generate'
        },
        requestId: 'run-1:node-1:attempt-3:chat'
      },
      messages: [{ role: 'user' as const, content: 'hello' }],
      providerId: 'openai'
    };

    await expect(new PiExecutionService().streamText(request)).resolves.toBe('streamed');
    expect(emitAiUsageObservedEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptIndex: 2,
        requestId: 'run-1:node-1:attempt-3:chat',
        status: 'completed',
        usage: expect.objectContaining({ totalTokens: 3 })
      }),
      { producer: 'PiExecutionService:streamText' }
    );
  });

  it('forwards cancellation to non-streaming text execution', async () => {
    const signal = new AbortController().signal;
    const request = {
      extras: {
        analyticsUsage: {
          metadata: { workflowAttempt: 2 },
          operationKey: 'chat',
          sourceId: 'node-1',
          sourceLabel: 'AI chat',
          sourceType: 'workflow',
          usageCategory: 'workflow',
          usageFeature: 'workflow_ai',
          usageStage: 'generate'
        },
        model: 'gpt-test',
        requestId: 'run-1:node-1:attempt-2:chat'
      },
      messages: [{ role: 'user' as const, content: 'hello' }],
      providerId: 'openai'
    };

    await expect(new PiExecutionService().completeText(request, signal)).resolves.toBe('completed');
    expect(chatEphemeralMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ...request,
        extras: expect.objectContaining(request.extras)
      }),
      signal
    );
    expect(emitAiUsageObservedEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptIndex: 1,
        operationKey: 'chat',
        requestId: 'run-1:node-1:attempt-2:chat',
        status: 'completed',
        usageFeature: 'workflow_ai'
      }),
      { producer: 'PiExecutionService:completeText' }
    );
  });

  it('resolves a usable preset for speech synthesis when providerPresetId is automatic', async () => {
    const synthesizeSpeech = vi.fn(async (request: SpeechSynthesisRequest) => ({
      artifacts: [{ audioBase64: Buffer.from('preset audio').toString('base64'), format: 'mp3', mimeType: 'audio/mpeg' }],
      model: request.model,
      providerId: request.providerId,
      voiceId: request.voiceId
    }));
    getProviderMock.mockReturnValue({
      id: 'minimax',
      label: 'MiniMax',
      synthesizeSpeech
    });
    resolveUsablePresetMock.mockResolvedValue({ id: 'preset-minimax', providerId: 'minimax' });
    getPresetMock.mockImplementation((presetId?: string) => (presetId === 'preset-minimax' ? { id: 'preset-minimax', providerId: 'minimax' } : undefined));
    getPresetSecretsMock.mockResolvedValue({ apiKey: 'preset-key', baseUrl: 'https://api.minimaxi.com/v1' });

    const service = new PiExecutionService();
    await service.synthesizeSpeech({
      model: 'speech-2.8-turbo',
      providerId: 'minimax',
      text: '你好',
      voiceId: 'female-shaonv'
    });

    expect(resolveUsablePresetMock).toHaveBeenCalledWith('minimax');
    expect(getPresetSecretsMock).toHaveBeenCalledWith('preset-minimax', ['apiKey', 'baseUrl']);
    expect(synthesizeSpeech).toHaveBeenCalledWith(
      expect.objectContaining({
        extras: expect.objectContaining({
          secrets: expect.objectContaining({ apiKey: 'preset-key' })
        }),
        providerPresetId: 'preset-minimax'
      }),
      undefined
    );
  });
});
