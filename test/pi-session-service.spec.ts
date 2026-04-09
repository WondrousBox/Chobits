import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildPiModelHeadersMock,
  buildPiModelMock,
  isPiRuntimeRequestedMock,
  preWarmEnrichersMock,
  piSessionFactoryCreateCodingSessionMock,
  resolvePiRequestMock,
  resolvePiToolDescriptorsMock
} = vi.hoisted(() => ({
  buildPiModelHeadersMock: vi.fn(),
  buildPiModelMock: vi.fn(),
  isPiRuntimeRequestedMock: vi.fn(),
  preWarmEnrichersMock: vi.fn(),
  piSessionFactoryCreateCodingSessionMock: vi.fn(),
  resolvePiRequestMock: vi.fn(),
  resolvePiToolDescriptorsMock: vi.fn()
}));

vi.mock('../packages/ai/runtime/pi/model-resolver', () => ({
  resolvePiRequest: resolvePiRequestMock
}));

vi.mock('../packages/ai/runtime/pi/provider-model', () => ({
  buildPiModel: buildPiModelMock,
  buildPiModelHeaders: buildPiModelHeadersMock
}));

vi.mock('../packages/ai/runtime/pi/runtime-switch', () => ({
  isPiRuntimeRequested: isPiRuntimeRequestedMock
}));

vi.mock('../packages/ai/runtime/pi/tool-registry', () => ({
  resolvePiToolDescriptors: resolvePiToolDescriptorsMock
}));

vi.mock('../packages/ai/runtime/pi/session-factory', () => ({
  PiSessionFactory: class PiSessionFactory {
    createCodingSession = piSessionFactoryCreateCodingSessionMock;
  }
}));

vi.mock('../packages/ai/system-prompt-enricher', () => ({
  preWarmEnrichers: preWarmEnrichersMock,
  resolveSystemPromptEnrichments: vi.fn().mockResolvedValue([])
}));

import { PiSessionService } from '../packages/ai/runtime/pi/session-service';

describe('PiSessionService coder workspace guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    buildPiModelHeadersMock.mockReturnValue(undefined);
    isPiRuntimeRequestedMock.mockReturnValue(true);
    piSessionFactoryCreateCodingSessionMock.mockReset();
    preWarmEnrichersMock.mockReset();
    resolvePiToolDescriptorsMock.mockReturnValue([
      {
        id: 'file-read',
        name: 'fileReadTool',
        description: 'Read workspace files',
        category: 'file',
        status: 'ready-for-pi-runtime'
      }
    ]);
  });

  it('returns a direct assistant response when coder has no workspace', async () => {
    resolvePiRequestMock.mockResolvedValue({
      runtime: 'pi',
      runtimeRequested: true,
      request: {
        providerId: 'openai',
        agentId: 'coder',
        messages: [{ role: 'user', content: 'read package.json' }]
      },
      profile: {
        id: 'coder',
        label: 'Coder',
        instructions: 'coder profile',
        defaultToolIds: ['file-read'],
        executionMode: 'session',
        supportsToolCalls: true
      },
      model: {
        providerId: 'openai',
        canonicalProviderId: 'openai',
        modelId: 'gpt-5',
        source: 'provider',
        secrets: {}
      },
      messages: [{ role: 'user', content: 'read package.json' }],
      enabledToolIds: ['file-read']
    });

    const service = new PiSessionService();
    const response = await service.chat({
      providerId: 'openai',
      agentId: 'coder',
      messages: [{ role: 'user', content: 'read package.json' }]
    } as any);

    expect(response.agentId).toBe('coder');
    expect(response.message.role).toBe('assistant');
    expect(response.message.content).toBeTruthy();
    expect(response.metadata).toMatchObject({
      runtime: 'pi',
      profileId: 'coder',
      providerId: 'openai'
    });
    expect(buildPiModelMock).not.toHaveBeenCalled();
  });

  it('emits workspace-required stream events before any model execution', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      resolvePiRequestMock.mockResolvedValue({
        runtime: 'pi',
        runtimeRequested: true,
        request: {
          providerId: 'openai',
          agentId: 'coder',
          messages: [{ role: 'user', content: 'edit src/main.ts' }]
        },
        profile: {
          id: 'coder',
          label: 'Coder',
          instructions: 'coder profile',
          defaultToolIds: ['file-read'],
          executionMode: 'session',
          supportsToolCalls: true
        },
        model: {
          providerId: 'openai',
          canonicalProviderId: 'openai',
          modelId: 'gpt-5',
          source: 'provider',
          secrets: {}
        },
        messages: [{ role: 'user', content: 'edit src/main.ts' }],
        enabledToolIds: ['file-read']
      });

      const events: Array<{ type: string; data?: any }> = [];
      const service = new PiSessionService();

      await service.chatStream(
        {
          providerId: 'openai',
          agentId: 'coder',
          messages: [{ role: 'user', content: 'edit src/main.ts' }]
        } as any,
        (event) => {
          events.push(event);
        }
      );

      expect(events.map((event) => event.type)).toEqual(['connected', 'metadata', 'message_completed', 'done']);
      expect(preWarmEnrichersMock).toHaveBeenCalledTimes(1);
      expect(preWarmEnrichersMock).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'coder',
          providerId: 'openai'
        })
      );
      expect(events[1].data).toMatchObject({
        runtime: 'pi',
        profileId: 'coder',
        workspaceRequired: true
      });
      expect(events[2].data?.message?.metadata).toMatchObject({
        runtime: 'pi',
        workspaceRequired: true
      });
      expect(buildPiModelMock).not.toHaveBeenCalled();
      expect(
        logSpy.mock.calls
          .map((call) => String(call[0]))
          .filter((line) => line.startsWith('[MemoryTrace] '))
          .map((line) => JSON.parse(line.slice('[MemoryTrace] '.length)).event)
      ).toEqual(expect.arrayContaining(['pi_chat_stream.prewarm.start', 'pi_chat_stream.prewarm.dispatched']));
    } finally {
      logSpy.mockRestore();
    }
  });
});
