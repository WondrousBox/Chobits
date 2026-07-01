import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
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
    getAvailability() {
      return { available: false, reason: 'mocked in speech synthesis tests' };
    }
  }
}));

import { PiExecutionService } from '../packages/ai/runtime/pi/execution-service';
import type { SpeechSynthesisRequest } from '../packages/ai/types';

describe('PiExecutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    toCanonicalProviderIdMock.mockImplementation((providerId?: string) => providerId || '');
    resolveKnownProviderIdMock.mockImplementation((providerId: string) => providerId);
    listProviderSecretKeysMock.mockReturnValue(['apiKey', 'baseUrl']);
    getProviderDefinitionDefaultModelMock.mockReturnValue('speech-2.8-turbo');
    getAllSecretsMock.mockResolvedValue({});
    getFirstApiKeyMock.mockImplementation((value: string | undefined) => value);
    supportsProviderCapabilityMock.mockReturnValue(true);
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
