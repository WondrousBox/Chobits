import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getAllSecretsMock,
  getFirstApiKeyMock,
  getPiAgentProfileMock,
  getPresetMock,
  getPresetSecretsMock,
  getProviderDefinitionDefaultModelMock,
  getProviderMock,
  isPiRuntimeRequestedMock,
  listProviderSecretKeysMock,
  normalizePiToolIdsMock,
  resolveKnownProviderIdMock,
  resolveProviderPresetIdMock,
  toCanonicalProviderIdMock
} = vi.hoisted(() => ({
  getAllSecretsMock: vi.fn(),
  getFirstApiKeyMock: vi.fn(),
  getPiAgentProfileMock: vi.fn(),
  getPresetMock: vi.fn(),
  getPresetSecretsMock: vi.fn(),
  getProviderDefinitionDefaultModelMock: vi.fn(),
  getProviderMock: vi.fn(),
  isPiRuntimeRequestedMock: vi.fn(),
  listProviderSecretKeysMock: vi.fn(),
  normalizePiToolIdsMock: vi.fn((toolIds?: string[]) => [...new Set(toolIds || [])]),
  resolveKnownProviderIdMock: vi.fn(),
  resolveProviderPresetIdMock: vi.fn(),
  toCanonicalProviderIdMock: vi.fn()
}));

vi.mock('../../packages/ai/preset-service', () => ({
  getPreset: getPresetMock,
  getPresetSecrets: getPresetSecretsMock
}));

vi.mock('../../packages/ai/provider-preset', () => ({
  resolveProviderPresetId: resolveProviderPresetIdMock
}));

vi.mock('../../packages/ai/providers/service', () => ({
  getProviderDefinitionDefaultModel: getProviderDefinitionDefaultModelMock,
  listProviderSecretKeys: listProviderSecretKeysMock,
  resolveKnownProviderId: resolveKnownProviderIdMock,
  toCanonicalProviderId: toCanonicalProviderIdMock
}));

vi.mock('../../packages/ai/registry', () => ({
  getProvider: getProviderMock
}));

vi.mock('../../packages/ai/settings-store', () => ({
  getAllSecrets: getAllSecretsMock,
  getFirstApiKey: getFirstApiKeyMock
}));

vi.mock('../../packages/ai/runtime/pi/profile-registry', () => ({
  getPiAgentProfile: getPiAgentProfileMock
}));

vi.mock('../../packages/ai/runtime/pi/runtime-switch', () => ({
  isPiRuntimeRequested: isPiRuntimeRequestedMock
}));

vi.mock('../../packages/ai/runtime/pi/tool-registry', () => ({
  normalizePiToolIds: normalizePiToolIdsMock
}));

import { resolvePiRequest } from '../../packages/ai/runtime/pi/model-resolver';

describe('resolvePiRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    resolveProviderPresetIdMock.mockReturnValue('preset-1');
    getPresetMock.mockReturnValue({
      id: 'preset-1',
      providerId: 'openai',
      systemPrompt: 'Preset prompt',
      enabledTools: ['file-read', 'shell-exec', 'file-read']
    });
    getPresetSecretsMock.mockResolvedValue({
      apiKey: 'preset-key',
      baseUrl: 'https://preset.example'
    });
    toCanonicalProviderIdMock.mockImplementation((providerId: string) => providerId);
    resolveKnownProviderIdMock.mockImplementation((providerId: string) => providerId);
    listProviderSecretKeysMock.mockReturnValue(['apiKey', 'baseUrl', 'model']);
    getProviderDefinitionDefaultModelMock.mockReturnValue('gpt-default');
    getProviderMock.mockReturnValue({
      id: 'openai',
      label: 'OpenAI',
      getSecrets: () => ({
        apiKey: 'adapter-key',
        model: 'provider-model'
      })
    });
    getAllSecretsMock.mockResolvedValue({
      apiKey: 'provider-key',
      baseUrl: 'https://provider.example'
    });
    getFirstApiKeyMock.mockImplementation((value: string | undefined) => value);
    getPiAgentProfileMock.mockReturnValue({
      id: 'coder',
      label: 'Coder',
      description: 'Workspace coding profile',
      executionMode: 'session',
      supportsToolCalls: true,
      instructions: 'test profile',
      defaultToolIds: ['file-list']
    });
    isPiRuntimeRequestedMock.mockReturnValue(true);
  });

  it('parses coding workspace extras and prepends preset system prompts', async () => {
    const resolved = await resolvePiRequest({
      providerId: 'openai',
      agentId: 'coder',
      messages: [{ role: 'user', content: 'hello world' }],
      extras: {
        model: 'gpt-5',
        codingWorkspaceRoot: ' F:/repo ',
        codingWorkspaceLabel: ' demo-repo ',
        enabledTools: ['file-read', 'shell-exec', 'file-read']
      }
    } as any);

    expect(resolved.runtime).toBe('pi');
    expect(resolved.runtimeRequested).toBe(true);
    expect(resolved.coding).toEqual({
      mode: 'safe',
      rootPath: 'F:/repo',
      label: 'demo-repo',
      source: 'manual'
    });
    expect(resolved.messages).toEqual([
      {
        role: 'system',
        content: 'Preset prompt'
      },
      {
        role: 'user',
        content: 'hello world'
      }
    ]);
    expect(resolved.enabledToolIds).toEqual(['file-read', 'shell-exec']);
    expect(resolved.model).toMatchObject({
      providerId: 'openai',
      canonicalProviderId: 'openai',
      modelId: 'gpt-5',
      apiKey: 'preset-key',
      baseUrl: 'https://preset.example',
      source: 'preset'
    });
    expect(normalizePiToolIdsMock).toHaveBeenCalledWith(['file-read', 'shell-exec', 'file-read']);
  });

  it('falls back to profile tool defaults when request and preset do not specify tools', async () => {
    getPresetMock.mockReturnValue(undefined);
    getPresetSecretsMock.mockResolvedValue({});
    getProviderMock.mockReturnValue({
      id: 'openai',
      label: 'OpenAI',
      getSecrets: () => ({})
    });
    getAllSecretsMock.mockResolvedValue({});
    getPiAgentProfileMock.mockReturnValue({
      id: 'assistant',
      label: 'Assistant',
      description: 'Default assistant',
      executionMode: 'session',
      supportsToolCalls: true,
      instructions: 'assistant profile',
      defaultToolIds: ['query-resources', 'push-card']
    });
    isPiRuntimeRequestedMock.mockReturnValue(false);

    const resolved = await resolvePiRequest({
      providerId: 'openai',
      agentId: 'assistant',
      messages: [{ role: 'user', content: 'hi' }]
    } as any);

    expect(resolved.runtime).toBe('legacy');
    expect(resolved.runtimeRequested).toBe(false);
    expect(resolved.coding).toBeUndefined();
    expect(resolved.messages).toEqual([
      {
        role: 'user',
        content: 'hi'
      }
    ]);
    expect(resolved.enabledToolIds).toEqual(['query-resources', 'push-card']);
    expect(normalizePiToolIdsMock).toHaveBeenCalledWith(['query-resources', 'push-card']);
    expect(resolved.model.modelId).toBe('gpt-default');
    expect(resolved.model.source).toBe('provider');
  });

  it('normalizes structured explicit skill invocation input from request extras', async () => {
    getPresetMock.mockReturnValue(undefined);
    getPresetSecretsMock.mockResolvedValue({});
    getProviderMock.mockReturnValue({
      id: 'openai',
      label: 'OpenAI',
      getSecrets: () => ({})
    });
    getAllSecretsMock.mockResolvedValue({});
    getPiAgentProfileMock.mockReturnValue({
      id: 'assistant',
      label: 'Agent模式',
      description: 'Assistant mode',
      executionMode: 'session',
      supportsToolCalls: true,
      instructions: 'skill profile',
      defaultToolIds: ['toolbox-lookup', 'ask-user', 'skill-search', 'skill-use']
    });

    const resolved = await resolvePiRequest({
      providerId: 'openai',
      agentId: 'assistant',
      messages: [{ role: 'user', content: 'Translate this subtitle' }],
      extras: {
        explicitSkillInvocation: {
          matchedReference: ' subtitle-translate ',
          remainingQuery: ' translate this subtitle into English ',
          source: 'slash-command'
        }
      }
    } as any);

    expect(resolved.requestedSkillInvocation).toEqual({
      matchedReference: 'subtitle-translate',
      remainingQuery: 'translate this subtitle into English',
      source: 'slash-command'
    });
    expect(resolved.messages).toEqual([{ role: 'user', content: 'Translate this subtitle' }]);
  });
});
