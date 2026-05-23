import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  buildPiModelHeadersMock,
  buildPiModelMock,
  createPiEmojiSendToolMock,
  isPiRuntimeRequestedMock,
  piSessionFactoryCreateCodingSessionMock,
  resolvePiRequestMock,
  resolvePiToolDescriptorsMock
} = vi.hoisted(() => ({
  buildPiModelHeadersMock: vi.fn(),
  buildPiModelMock: vi.fn(),
  createPiEmojiSendToolMock: vi.fn(),
  isPiRuntimeRequestedMock: vi.fn(),
  piSessionFactoryCreateCodingSessionMock: vi.fn(),
  resolvePiRequestMock: vi.fn(),
  resolvePiToolDescriptorsMock: vi.fn()
}))

vi.mock('../packages/ai/runtime/pi/model-resolver', () => ({
  resolvePiRequest: resolvePiRequestMock
}))

vi.mock('../packages/ai/runtime/pi/provider-model', () => ({
  buildPiModel: buildPiModelMock,
  buildPiModelHeaders: buildPiModelHeadersMock
}))

vi.mock('../packages/ai/runtime/pi/runtime-switch', () => ({
  isPiRuntimeRequested: isPiRuntimeRequestedMock
}))

vi.mock('../packages/ai/runtime/pi/tool-registry', async () => {
  const actual = await vi.importActual<typeof import('../packages/ai/runtime/pi/tool-registry')>('../packages/ai/runtime/pi/tool-registry')
  return {
    ...actual,
    resolvePiToolDescriptors: resolvePiToolDescriptorsMock
  }
})

vi.mock('../packages/ai/runtime/pi/session-factory', () => ({
  PiSessionFactory: class PiSessionFactory {
    createCodingSession = piSessionFactoryCreateCodingSessionMock
  }
}))

vi.mock('../packages/ai/runtime/pi/tools/emoji-packs', () => ({
  createPiEmojiSendTool: createPiEmojiSendToolMock
}))

vi.mock('../packages/ai/system-prompt-enricher', () => ({
  preWarmEnrichers: vi.fn(),
  resolveSystemPromptEnrichments: vi.fn().mockResolvedValue([])
}))

import { PiSessionService } from '../packages/ai/runtime/pi/session-service'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (targetPath) => {
      await fs.rm(targetPath, { force: true, recursive: true })
    })
  )
})

describe('PiSessionService context building', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    buildPiModelHeadersMock.mockReturnValue(undefined)
    buildPiModelMock.mockImplementation(async (_ai: unknown, resolved: any) => ({
      api: {},
      id: resolved.model.modelId || 'gpt-5',
      provider: 'openai'
    }))
    isPiRuntimeRequestedMock.mockReturnValue(true)
    createPiEmojiSendToolMock.mockImplementation(() => ({
      execute: vi.fn(async () => ({
        details: {
          success: false
        }
      }))
    }))
    resolvePiToolDescriptorsMock.mockReturnValue([
      {
        id: 'skill-search',
        name: 'skillSearchTool',
        description: 'Search skills',
        category: 'meta',
        status: 'ready-for-pi-runtime'
      },
      {
        id: 'skill-use',
        name: 'skillUseTool',
        description: 'Use skills',
        category: 'meta',
        status: 'ready-for-pi-runtime'
      }
    ])
  })

  it('loads instruction files into the default assistant and preprocesses explicit slash skill input before session prompt split', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-session-context-'))
    tempRoots.push(tempRoot)

    const repoRoot = path.join(tempRoot, 'repo')
    const workspaceRoot = path.join(repoRoot, 'apps', 'demo')
    await fs.mkdir(path.join(repoRoot, '.git'), { recursive: true })
    await writeText(path.join(repoRoot, 'AGENTS.md'), '## Repo Rules\nMention the repository context.')
    await writeText(path.join(workspaceRoot, '.chobits', 'AGENTS.md'), '## Workspace Rules\nPrefer the demo workspace.')
    await writeText(
      path.join(workspaceRoot, '.chobits', 'skills', 'subtitle-translate', 'SKILL.md'),
      `---
name: subtitle-translate
description: Translate subtitle content.
user-invocable: true
---
1. Translate the subtitle carefully.
`
    )

    let capturedPrompt = ''
    let capturedSystemPrompt = ''
    let capturedResolved: any

    piSessionFactoryCreateCodingSessionMock.mockImplementation(async (options: any) => {
      capturedSystemPrompt = options.systemPrompt || ''
      capturedResolved = options.resolved

      const sessionState = { messages: [] as any[] }
      const session = {
        agent: {
          prompt: vi.fn(async (prompt: string) => {
            capturedPrompt = prompt
            sessionState.messages.push(createAssistantMessage('done'))
          }),
          replaceMessages: vi.fn()
        },
        state: sessionState
      }

      return {
        dispose: vi.fn(),
        session,
        toolContext: {}
      }
    })

    resolvePiRequestMock.mockResolvedValue({
      runtime: 'pi',
      runtimeRequested: true,
      request: {
        agentId: 'assistant',
        messages: [{ role: 'user', content: '/subtitle-translate translate this subtitle into English' }],
        providerId: 'openai'
      },
      profile: {
        defaultToolIds: ['toolbox-lookup', 'ask-user', 'skill-search', 'skill-use'],
        executionMode: 'session',
        id: 'assistant',
        instructions: '## Base Rules\nUse the skill system when appropriate.',
        label: 'Assistant',
        supportsToolCalls: true,
        toolInjectionMode: 'dynamic'
      },
      model: {
        canonicalProviderId: 'openai',
        modelId: 'gpt-5',
        providerId: 'openai',
        secrets: {},
        source: 'provider'
      },
      messages: [{ role: 'user', content: '/subtitle-translate translate this subtitle into English' }],
      enabledToolIds: ['skill-search', 'skill-use'],
      coding: {
        label: 'demo',
        mode: 'safe',
        rootPath: workspaceRoot,
        source: 'manual'
      }
    })

    const service = new PiSessionService()
    const response = await service.chat({
      agentId: 'assistant',
      messages: [{ role: 'user', content: '/subtitle-translate translate this subtitle into English' }],
      providerId: 'openai'
    } as any)

    expect(response.message.content).toBe('done')
    expect(capturedSystemPrompt).toContain('## Base Rules')
    expect(capturedSystemPrompt).toContain('## Repo Rules')
    expect(capturedSystemPrompt).toContain('## Workspace Rules')
    expect(capturedSystemPrompt).toContain('## Available Skills')
    expect(capturedSystemPrompt).toContain('## Explicit Skill Invocation')
    expect(capturedSystemPrompt).toContain("skillUseTool({ skill: 'subtitle-translate', mode: 'inline' })")
    expect(capturedResolved.explicitSkillInvocation).toEqual({
      effort: undefined,
      executionContext: undefined,
      matchedReference: 'subtitle-translate',
      model: undefined,
      remainingQuery: 'translate this subtitle into English',
      skillName: 'subtitle-translate',
      source: 'project',
      sourceLabel: 'Project',
      sourcePolicy: {
        message: 'This skill source is treated as normal within the current runtime guardrails.',
        recommendedMode: 'inline',
        requiresExplicitUserIntent: false,
        requiresPreviewBeforeInline: false,
        riskLevel: 'normal',
        sensitiveToolCategories: [],
        sensitiveToolIds: []
      },
      trustLevel: 'workspace',
      trustNote: expect.stringContaining('Workspace skill')
    })
    expect(capturedResolved.messages).toEqual([{ role: 'user', content: 'translate this subtitle into English' }])
    expect(capturedPrompt).toBe('translate this subtitle into English')
  })

  it('skips skill prompt injection when the assistant session does not have skill tools enabled', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-session-context-default-assistant-'))
    tempRoots.push(tempRoot)

    const workspaceRoot = path.join(tempRoot, 'repo')
    await fs.mkdir(path.join(workspaceRoot, '.git'), { recursive: true })
    await writeText(
      path.join(workspaceRoot, '.chobits', 'skills', 'subtitle-translate', 'SKILL.md'),
      `---
name: subtitle-translate
description: Translate subtitle content.
user-invocable: true
---
1. Translate the subtitle carefully.
`
    )

    let capturedPrompt = ''
    let capturedSystemPrompt = ''
    let capturedResolved: any

    piSessionFactoryCreateCodingSessionMock.mockImplementation(async (options: any) => {
      capturedSystemPrompt = options.systemPrompt || ''
      capturedResolved = options.resolved

      const sessionState = { messages: [] as any[] }
      const session = {
        agent: {
          prompt: vi.fn(async (prompt: string) => {
            capturedPrompt = prompt
            sessionState.messages.push(createAssistantMessage('done'))
          }),
          replaceMessages: vi.fn()
        },
        state: sessionState
      }

      return {
        dispose: vi.fn(),
        session,
        toolContext: {}
      }
    })

    resolvePiRequestMock.mockResolvedValue({
      runtime: 'pi',
      runtimeRequested: true,
      request: {
        agentId: 'assistant',
        messages: [{ role: 'user', content: '/subtitle-translate translate this subtitle into English' }],
        providerId: 'openai'
      },
      profile: {
        defaultToolIds: ['toolbox-lookup', 'ask-user'],
        executionMode: 'session',
        id: 'assistant',
        instructions: '## Base Rules\nStay toolbox-first by default.',
        label: 'Assistant',
        supportsToolCalls: true,
        toolInjectionMode: 'dynamic'
      },
      model: {
        canonicalProviderId: 'openai',
        modelId: 'gpt-5',
        providerId: 'openai',
        secrets: {},
        source: 'provider'
      },
      messages: [{ role: 'user', content: '/subtitle-translate translate this subtitle into English' }],
      enabledToolIds: ['toolbox-lookup', 'ask-user'],
      coding: {
        label: 'demo',
        mode: 'safe',
        rootPath: workspaceRoot,
        source: 'manual'
      }
    })

    const service = new PiSessionService()
    const response = await service.chat({
      agentId: 'assistant',
      messages: [{ role: 'user', content: '/subtitle-translate translate this subtitle into English' }],
      providerId: 'openai'
    } as any)

    expect(response.message.content).toBe('done')
    expect(capturedSystemPrompt).toContain('## Base Rules')
    expect(capturedSystemPrompt).not.toContain('## Available Skills')
    expect(capturedSystemPrompt).not.toContain('## Relevant Skills For This Request')
    expect(capturedSystemPrompt).not.toContain('## Explicit Skill Invocation')
    expect(capturedResolved.explicitSkillInvocation).toBeUndefined()
    expect(capturedResolved.messages).toEqual([{ role: 'user', content: '/subtitle-translate translate this subtitle into English' }])
    expect(capturedPrompt).toBe('/subtitle-translate translate this subtitle into English')
  })

  it('prefers structured explicit skill invocation input over slash text parsing when provided by the request layer', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-session-context-structured-skill-'))
    tempRoots.push(tempRoot)

    const workspaceRoot = path.join(tempRoot, 'repo')
    await fs.mkdir(path.join(workspaceRoot, '.git'), { recursive: true })
    await writeText(
      path.join(workspaceRoot, '.chobits', 'skills', 'subtitle-translate', 'SKILL.md'),
      `---
name: subtitle-translate
description: Translate subtitle content.
aliases: [translate-subtitle]
user-invocable: true
---
1. Translate the subtitle carefully.
`
    )

    let capturedPrompt = ''
    let capturedSystemPrompt = ''
    let capturedResolved: any

    piSessionFactoryCreateCodingSessionMock.mockImplementation(async (options: any) => {
      capturedSystemPrompt = options.systemPrompt || ''
      capturedResolved = options.resolved

      const sessionState = { messages: [] as any[] }
      const session = {
        agent: {
          prompt: vi.fn(async (prompt: string) => {
            capturedPrompt = prompt
            sessionState.messages.push(createAssistantMessage('done'))
          }),
          replaceMessages: vi.fn()
        },
        state: sessionState
      }

      return {
        dispose: vi.fn(),
        session,
        toolContext: {}
      }
    })

    resolvePiRequestMock.mockResolvedValue({
      runtime: 'pi',
      runtimeRequested: true,
      request: {
        agentId: 'assistant',
        extras: {
          explicitSkillInvocation: {
            matchedReference: 'translate-subtitle',
            remainingQuery: 'translate this subtitle into English',
            source: 'input'
          }
        },
        messages: [{ role: 'user', content: 'Please help with this subtitle.' }],
        providerId: 'openai'
      },
      profile: {
        defaultToolIds: ['toolbox-lookup', 'ask-user', 'skill-search', 'skill-use'],
        executionMode: 'session',
        id: 'assistant',
        instructions: '## Base Rules\nUse the skill system when appropriate.',
        label: 'Assistant',
        supportsToolCalls: true,
        toolInjectionMode: 'dynamic'
      },
      model: {
        canonicalProviderId: 'openai',
        modelId: 'gpt-5',
        providerId: 'openai',
        secrets: {},
        source: 'provider'
      },
      messages: [{ role: 'user', content: 'Please help with this subtitle.' }],
      requestedSkillInvocation: {
        matchedReference: 'translate-subtitle',
        remainingQuery: 'translate this subtitle into English',
        source: 'input'
      },
      enabledToolIds: ['skill-search', 'skill-use'],
      coding: {
        label: 'demo',
        mode: 'safe',
        rootPath: workspaceRoot,
        source: 'manual'
      }
    })

    const service = new PiSessionService()
    const response = await service.chat({
      agentId: 'assistant',
      messages: [{ role: 'user', content: 'Please help with this subtitle.' }],
      providerId: 'openai'
    } as any)

    expect(response.message.content).toBe('done')
    expect(capturedSystemPrompt).toContain('## Explicit Skill Invocation')
    expect(capturedSystemPrompt).toContain("skillUseTool({ skill: 'subtitle-translate', mode: 'inline' })")
    expect(capturedResolved.explicitSkillInvocation).toEqual({
      effort: undefined,
      executionContext: undefined,
      matchedReference: 'translate-subtitle',
      model: undefined,
      remainingQuery: 'translate this subtitle into English',
      skillName: 'subtitle-translate',
      source: 'project',
      sourceLabel: 'Project',
      sourcePolicy: {
        message: 'This skill source is treated as normal within the current runtime guardrails.',
        recommendedMode: 'inline',
        requiresExplicitUserIntent: false,
        requiresPreviewBeforeInline: false,
        riskLevel: 'normal',
        sensitiveToolCategories: [],
        sensitiveToolIds: []
      },
      trustLevel: 'workspace',
      trustNote: expect.stringContaining('Workspace skill')
    })
    expect(capturedResolved.messages).toEqual([{ role: 'user', content: 'translate this subtitle into English' }])
    expect(capturedPrompt).toBe('translate this subtitle into English')
  })

  it('falls back to slash text parsing when structured explicit skill input does not resolve to a known skill', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-session-context-structured-fallback-'))
    tempRoots.push(tempRoot)

    const workspaceRoot = path.join(tempRoot, 'repo')
    await fs.mkdir(path.join(workspaceRoot, '.git'), { recursive: true })
    await writeText(
      path.join(workspaceRoot, '.chobits', 'skills', 'subtitle-translate', 'SKILL.md'),
      `---
name: 字幕翻译
description: Translate subtitle content.
user-invocable: true
---
1. Translate the subtitle carefully.
`
    )

    let capturedPrompt = ''
    let capturedSystemPrompt = ''
    let capturedResolved: any

    piSessionFactoryCreateCodingSessionMock.mockImplementation(async (options: any) => {
      capturedSystemPrompt = options.systemPrompt || ''
      capturedResolved = options.resolved

      const sessionState = { messages: [] as any[] }
      const session = {
        agent: {
          prompt: vi.fn(async (prompt: string) => {
            capturedPrompt = prompt
            sessionState.messages.push(createAssistantMessage('done'))
          }),
          replaceMessages: vi.fn()
        },
        state: sessionState
      }

      return {
        dispose: vi.fn(),
        session,
        toolContext: {}
      }
    })

    resolvePiRequestMock.mockResolvedValue({
      runtime: 'pi',
      runtimeRequested: true,
      request: {
        agentId: 'assistant',
        extras: {
          explicitSkillInvocation: {
            matchedReference: 'subtitle-translate',
            remainingQuery: 'translate this subtitle into English',
            source: 'slash-command'
          }
        },
        messages: [{ role: 'user', content: '/字幕翻译 translate this subtitle into English' }],
        providerId: 'openai'
      },
      profile: {
        defaultToolIds: ['toolbox-lookup', 'ask-user', 'skill-search', 'skill-use'],
        executionMode: 'session',
        id: 'assistant',
        instructions: '## Base Rules\nUse the skill system when appropriate.',
        label: 'Assistant',
        supportsToolCalls: true,
        toolInjectionMode: 'dynamic'
      },
      model: {
        canonicalProviderId: 'openai',
        modelId: 'gpt-5',
        providerId: 'openai',
        secrets: {},
        source: 'provider'
      },
      messages: [{ role: 'user', content: '/字幕翻译 translate this subtitle into English' }],
      requestedSkillInvocation: {
        matchedReference: 'subtitle-translate',
        remainingQuery: 'translate this subtitle into English',
        source: 'slash-command'
      },
      enabledToolIds: ['skill-search', 'skill-use'],
      coding: {
        label: 'demo',
        mode: 'safe',
        rootPath: workspaceRoot,
        source: 'manual'
      }
    })

    const service = new PiSessionService()
    const response = await service.chat({
      agentId: 'assistant',
      messages: [{ role: 'user', content: '/字幕翻译 translate this subtitle into English' }],
      providerId: 'openai'
    } as any)

    expect(response.message.content).toBe('done')
    expect(capturedSystemPrompt).toContain('## Explicit Skill Invocation')
    expect(capturedSystemPrompt).toContain("skillUseTool({ skill: '字幕翻译', mode: 'inline' })")
    expect(capturedResolved.explicitSkillInvocation).toEqual({
      effort: undefined,
      executionContext: undefined,
      matchedReference: '字幕翻译',
      model: undefined,
      remainingQuery: 'translate this subtitle into English',
      skillName: '字幕翻译',
      source: 'project',
      sourceLabel: 'Project',
      sourcePolicy: {
        message: 'This skill source is treated as normal within the current runtime guardrails.',
        recommendedMode: 'inline',
        requiresExplicitUserIntent: false,
        requiresPreviewBeforeInline: false,
        riskLevel: 'normal',
        sensitiveToolCategories: [],
        sensitiveToolIds: []
      },
      trustLevel: 'workspace',
      trustNote: expect.stringContaining('Workspace skill')
    })
    expect(capturedResolved.messages).toEqual([{ role: 'user', content: 'translate this subtitle into English' }])
    expect(capturedPrompt).toBe('translate this subtitle into English')
  })

  it('injects a fork runner that spawns a child coding session with tool and model overrides', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-session-fork-context-'))
    tempRoots.push(tempRoot)

    const workspaceRoot = path.join(tempRoot, 'repo')
    await fs.mkdir(path.join(workspaceRoot, '.git'), { recursive: true })

    let childOptions: any
    let capturedChildPrompt = ''
    let capturedChildHistory: any[] = []
    let capturedForkResult: any
    const forkProgressEvents: Array<{ callId: string; progress: number; message?: string }> = []
    const forkToolCalls: Array<{ name: string; args: unknown; callId: string }> = []
    const forkToolResults: Array<{ callId: string; result: unknown }> = []
    let childSubscriber: ((event: any) => void) | undefined

    piSessionFactoryCreateCodingSessionMock
      .mockImplementationOnce(async () => {
        const sessionState = { messages: [] as any[] }
        const toolContext: Record<string, any> = {
          emitToolCall: (name: string, args: unknown, callId: string) => {
            forkToolCalls.push({ name, args, callId })
          },
          emitToolResult: (callId: string, result: unknown) => {
            forkToolResults.push({ callId, result })
          },
          reportProgress: (callId: string, progress: number, message?: string) => {
            forkProgressEvents.push({ callId, progress, message })
          }
        }
        const session = {
          agent: {
            prompt: vi.fn(async () => {
              capturedForkResult = await toolContext.runForkedSkill?.(
                {
                  activatedToolNames: [],
                  activationToolIds: ['query-resources'],
                  allowedToolIds: ['query-resources', 'translate-subtitles'],
                  content: '1. Review the target carefully.\n2. Report the key findings.',
                  effort: 'high',
                  executionContext: 'fork',
                  executionMode: 'inline',
                  model: 'gpt-5.1',
                  pathsMatched: true,
                  record: {
                    aliases: [],
                    allowedToolIds: ['query-resources', 'translate-subtitles'],
                    activationToolIds: ['query-resources'],
                    argumentNames: [],
                    contentHash: 'hash',
                    description: 'Run a deeper review workflow.',
                    disableModelInvocation: false,
                    executionContext: 'fork',
                    model: 'gpt-5.1',
                    effort: 'high',
                    name: 'forked-review',
                    skillDir: path.join(workspaceRoot, '.chobits', 'skills', 'forked-review'),
                    skillFilePath: path.join(workspaceRoot, '.chobits', 'skills', 'forked-review', 'SKILL.md'),
                    source: 'project',
                    tags: [],
                    userInvocable: true
                  },
                  resolvedArgs: {},
                  source: 'project'
                },
                { toolCallId: 'skill-call-1' }
              )
              sessionState.messages.push(createAssistantMessage(capturedForkResult?.content || 'missing fork result'))
            }),
            replaceMessages: vi.fn()
          },
          state: sessionState
        }

        return {
          dispose: vi.fn(),
          session,
          toolContext
        }
      })
      .mockImplementationOnce(async (options: any) => {
        childOptions = options
        const sessionState = { messages: [] as any[] }
        const session = {
          agent: {
            prompt: vi.fn(async (prompt: string) => {
              capturedChildPrompt = prompt
              childSubscriber?.({
                type: 'tool_execution_start',
                toolCallId: 'child-1',
                toolName: 'resourceQueryTool',
                args: { query: 'demo' }
              })
              childSubscriber?.({
                type: 'tool_execution_end',
                toolCallId: 'child-1',
                result: { ok: true }
              })
              sessionState.messages.push(createAssistantMessage('forked child done'))
            }),
            replaceMessages: vi.fn((history: any[]) => {
              capturedChildHistory = history
            })
          },
          getActiveToolNames: () => ['resourceQueryTool', 'translationTool'],
          subscribe: vi.fn((listener: (event: any) => void) => {
            childSubscriber = listener
            return vi.fn()
          }),
          state: sessionState
        }

        return {
          dispose: vi.fn(),
          session,
          toolContext: {}
        }
      })

    resolvePiRequestMock.mockResolvedValue({
      runtime: 'pi',
      runtimeRequested: true,
      request: {
        agentId: 'assistant',
        messages: [{ role: 'user', content: 'Please review this change carefully.' }],
        providerId: 'openai'
      },
      profile: {
        defaultToolIds: ['skill-search', 'skill-use'],
        executionMode: 'session',
        id: 'assistant',
        instructions: '## Base Rules\nUse the skill system when appropriate.',
        label: 'Assistant',
        supportsToolCalls: true,
        toolInjectionMode: 'dynamic'
      },
      model: {
        canonicalProviderId: 'openai',
        modelId: 'gpt-5',
        providerId: 'openai',
        secrets: {},
        source: 'provider'
      },
      messages: [{ role: 'user', content: 'Please review this change carefully.' }],
      enabledToolIds: ['skill-search', 'skill-use'],
      coding: {
        label: 'repo',
        mode: 'safe',
        rootPath: workspaceRoot,
        source: 'manual'
      }
    })

    const service = new PiSessionService()
    const response = await service.chat({
      agentId: 'assistant',
      messages: [{ role: 'user', content: 'Please review this change carefully.' }],
      providerId: 'openai'
    } as any)

    expect(response.message.content).toBe('forked child done')
    expect(piSessionFactoryCreateCodingSessionMock).toHaveBeenCalledTimes(2)
    expect(childOptions.resolved.enabledToolIds).toEqual(['query-resources', 'translate-subtitles'])
    expect(childOptions.model.id).toBe('gpt-5.1')
    expect(childOptions.thinkingLevel).toBe('high')
    expect(capturedChildHistory).toEqual([])
    expect(capturedChildPrompt).toContain('Original user request:')
    expect(capturedChildPrompt).toContain('Please review this change carefully.')
    expect(capturedChildPrompt).toContain('Skill instructions:')
    expect(capturedChildPrompt).toContain('Review the target carefully.')
    expect(capturedForkResult).toMatchObject({
      activeToolNames: ['resourceQueryTool', 'translationTool'],
      content: 'forked child done',
      model: 'gpt-5.1',
      thinkingLevel: 'high',
      toolCalls: [
        {
          args: { query: 'demo' },
          callId: 'skill-call-1:fork:child-1',
          result: { ok: true },
          toolName: 'resourceQueryTool'
        }
      ]
    })
    expect(forkToolCalls).toEqual([
      {
        args: { query: 'demo' },
        callId: 'skill-call-1:fork:child-1',
        name: 'resourceQueryTool'
      }
    ])
    expect(forkToolResults).toEqual([
      {
        callId: 'skill-call-1:fork:child-1',
        result: { ok: true }
      }
    ])
    expect(forkProgressEvents).toHaveLength(6)
    expect(forkProgressEvents.every((event) => event.callId === 'skill-call-1')).toBe(true)
    expect(forkProgressEvents.at(0)?.message).toContain('Starting forked skill')
    expect(forkProgressEvents.at(-1)?.progress).toBe(100)
  })

  it('auto-sends an emoji before stream completion when emoji mode is enabled and the model did not send one', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-session-emoji-fallback-'))
    tempRoots.push(tempRoot)

    const sendExecuteMock = vi.fn(async () => ({
      details: {
        emoji: {
          mimeType: 'image/png',
          packId: 'pack-1',
          packName: 'pack',
          relativePath: 'hello.png',
          title: 'hello',
          url: 'res://emoji/hello.png'
        },
        markdown: '![hello](res://emoji/hello.png)',
        success: true
      }
    }))

    createPiEmojiSendToolMock.mockReturnValue({ execute: sendExecuteMock })

    let subscriber: ((event: any) => void) | undefined
    const sessionState = { messages: [] as any[] }
    piSessionFactoryCreateCodingSessionMock.mockImplementation(async () => {
      const session = {
        agent: {
          prompt: vi.fn(async () => {
            const assistant = createAssistantMessage('你好呀')
            sessionState.messages.push(assistant)
            subscriber?.({
              message: assistant,
              type: 'message_end'
            })
            subscriber?.({
              messages: sessionState.messages,
              type: 'agent_end'
            })
          }),
          replaceMessages: vi.fn()
        },
        getActiveToolNames: () => ['toolboxTool', 'emojiSendTool'],
        getAllTools: () => [
          { name: 'toolboxTool' },
          { name: 'emojiSendTool' }
        ],
        state: sessionState,
        subscribe: vi.fn((listener: (event: any) => void) => {
          subscriber = listener
          return vi.fn()
        })
      }

      return {
        dispose: vi.fn(),
        session,
        toolContext: {}
      }
    })

    resolvePiToolDescriptorsMock.mockReturnValue([
      {
        id: 'emoji-send',
        name: 'emojiSendTool',
        description: 'Send emoji',
        category: 'emoji',
        status: 'ready-for-pi-runtime'
      }
    ])

    resolvePiRequestMock.mockResolvedValue({
      runtime: 'pi',
      runtimeRequested: true,
      request: {
        agentId: 'assistant',
        extras: {
          emojiPacksEnabled: true
        },
        messages: [{ role: 'user', content: '你好' }],
        providerId: 'openai'
      },
      profile: {
        defaultToolIds: ['toolbox-lookup', 'ask-user', 'emoji-send'],
        executionMode: 'session',
        id: 'assistant',
        instructions: 'emoji profile',
        label: 'Assistant',
        supportsToolCalls: true,
        toolInjectionMode: 'dynamic'
      },
      model: {
        canonicalProviderId: 'openai',
        modelId: 'gpt-5',
        providerId: 'openai',
        secrets: {},
        source: 'provider'
      },
      messages: [{ role: 'user', content: '你好' }],
      enabledToolIds: ['toolbox-lookup', 'ask-user', 'emoji-send'],
      coding: {
        label: 'repo',
        mode: 'safe',
        rootPath: tempRoot,
        source: 'manual'
      }
    })

    const events: Array<{ type: string; data?: any }> = []
    const service = new PiSessionService()
    await service.chatStream(
      {
        agentId: 'assistant',
        extras: {
          emojiPacksEnabled: true
        },
        messages: [{ role: 'user', content: '你好' }],
        providerId: 'openai'
      } as any,
      (event) => {
        events.push(event)
      }
    )

    expect(events.map((event) => event.type)).toEqual(['connected', 'metadata', 'tool_call', 'tool_result', 'message_completed', 'done'])
    expect(events[2].data).toMatchObject({
      name: 'emojiSendTool',
      display: {
        mode: 'content-only'
      }
    })
    expect(typeof (events[2].data as any)?.args?.query).toBe('string')
    expect((events[2].data as any).args.query.length).toBeGreaterThan(0)
    expect((events[3].data?.result as any)?.details?.emoji?.url).toBe('res://emoji/hello.png')
    expect(events[4].data?.message?.content).toBe('你好呀')
    expect(sendExecuteMock).toHaveBeenCalledTimes(1)
    expect(sendExecuteMock).toHaveBeenCalledWith(
      expect.stringMatching(/^emoji-fallback-send-/),
      expect.objectContaining({ query: expect.any(String) })
    )
  })
})

function createAssistantMessage(text: string) {
  return {
    api: {},
    content: [
      {
        text,
        type: 'text'
      }
    ],
    model: 'gpt-5',
    provider: 'openai',
    role: 'assistant',
    stopReason: 'stop',
    timestamp: Date.now(),
    usage: {
      cacheRead: 0,
      cacheWrite: 0,
      cost: {
        cacheRead: 0,
        cacheWrite: 0,
        input: 0,
        output: 0,
        total: 0
      },
      input: 0,
      output: 0,
      totalTokens: 0
    }
  }
}

async function writeText(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}
