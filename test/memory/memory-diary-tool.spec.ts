import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const diaryState = vi.hoisted(() => ({
  rootPath: ''
}))

vi.mock('@packages/common/db', () => ({
  WorkspacesRepo: {
    getById: vi.fn(async () => (diaryState.rootPath ? { id: 'ws-1', rootPath: diaryState.rootPath } : null)),
    getDefault: vi.fn(async () => (diaryState.rootPath ? { id: 'ws-1', rootPath: diaryState.rootPath } : null))
  }
}))

vi.mock('../../packages/ai/services/memory-date', () => ({
  getTodayMemoryDate: () => '2026-04-12'
}))

import { createSkillSessionState, SkillRegistry } from '../../packages/ai/runtime/pi/skills'
import type { SkillRegistryEntry } from '../../packages/ai/runtime/pi/skills'
import { DEFAULT_SESSION_TOOL_IDS, getPiToolDescriptor } from '../../packages/ai/runtime/pi/tool-registry'
import { createPiMemoryDiaryTool } from '../../packages/ai/runtime/pi/tools/memory-diary'

afterEach(async () => {
  if (diaryState.rootPath) {
    await fs.rm(diaryState.rootPath, { recursive: true, force: true })
    diaryState.rootPath = ''
  }
})

function createToolContext(overrides: Record<string, unknown> = {}): any {
  return {
    resolved: {
      request: {
        extras: {
          workspaceId: 'ws-1'
        }
      }
    },
    ...overrides
  }
}

function getToolDetails(result: any): any {
  return result?.details
}

describe('memory diary tool', () => {
  it('keeps diary outside the default searchable memory surface', () => {
    expect(DEFAULT_SESSION_TOOL_IDS).not.toContain('memory-diary')

    const descriptor = getPiToolDescriptor('memory-diary')
    expect(descriptor?.description).toContain('长期记忆')
  })

  it('writes a log-only diary file and returns explicit non-retrievable flags', async () => {
    diaryState.rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'chobits-memory-diary-'))

    const tool = createPiMemoryDiaryTool(createToolContext())
    const result = getToolDetails(
      await tool.execute('call-1', {
        entry: 'This diary note should stay out of the searchable memory surface.',
        tags: ['debugging', 'user-preference']
      })
    )

    expect(result).toMatchObject({
      success: true,
      surface: 'log-only',
      indexed: false,
      searchable: false,
      recallable: false,
      date: '2026-04-12',
      file: 'memory/diary/2026-04-12.md'
    })

    const diaryFile = path.join(diaryState.rootPath, 'memory', 'diary', '2026-04-12.md')
    const content = await fs.readFile(diaryFile, 'utf-8')

    expect(content).toContain('# Agent Diary')
    expect(content).toContain('This diary note should stay out of the searchable memory surface.')
    expect(content).toContain('[debugging, user-preference]')
  })

  it('blocks diary writes when a guarded plugin skill is active but unapproved', async () => {
    diaryState.rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'chobits-memory-diary-guarded-'))

    const state = createSkillSessionState()
    state.activeSkillNames.add('danger-diary')
    const registry = SkillRegistry.fromEntries([
      createEntry({
        allowedToolIds: ['memory-diary'],
        description: 'Plugin diary writer.',
        name: 'danger-diary',
        source: 'plugin'
      })
    ])

    const tool = createPiMemoryDiaryTool(
      createToolContext({
        skillRegistry: registry,
        skillSessionState: state
      })
    )

    const result = getToolDetails(
      await tool.execute('call-guarded', {
        entry: 'This should never be written.',
        tags: ['guarded']
      })
    )

    expect(result).toMatchObject({
      success: false,
      requiresConfirmation: true,
      tool: 'memoryDiaryTool'
    })

    const diaryFile = path.join(diaryState.rootPath, 'memory', 'diary', '2026-04-12.md')
    await expect(fs.access(diaryFile)).rejects.toThrow()
  })
})

function createEntry(overrides: Partial<SkillRegistryEntry['record']> = {}): SkillRegistryEntry {
  const name = overrides.name || 'skill'

  return {
    locator: { kind: 'skill-file' },
    priority: 10,
    rawFrontmatter: {},
    record: {
      activationToolIds: [],
      aliases: [],
      allowedToolIds: [],
      argumentHint: undefined,
      argumentNames: [],
      contentHash: `${name}-hash`,
      description: `${name} description`,
      disableModelInvocation: false,
      name,
      paths: undefined,
      skillDir: `/tmp/${name}`,
      skillFilePath: `/tmp/${name}/SKILL.md`,
      source: 'bundled',
      tags: [],
      userInvocable: true,
      whenToUse: undefined,
      ...overrides
    }
  }
}
