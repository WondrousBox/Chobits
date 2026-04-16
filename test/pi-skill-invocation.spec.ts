import { describe, expect, it } from 'vitest'

import { buildExplicitSkillInvocationPrompt, normalizeRequestedSkillInvocation, resolveExplicitSkillInvocation, resolveRequestedSkillInvocation, SkillRegistry } from '../packages/ai/runtime/pi/skills'
import type { SkillRegistryEntry } from '../packages/ai/runtime/pi/skills'

describe('explicit skill invocation helpers', () => {
  it('resolves slash-invoked user skills and keeps the remaining natural-language request', () => {
    const registry = SkillRegistry.fromEntries([
      createEntry({
        aliases: ['download'],
        name: 'YouTube 下载'
      })
    ])

    const invocation = resolveExplicitSkillInvocation('/YouTube 下载 https://youtu.be/demo', registry)

    expect(invocation).toEqual({
      effort: undefined,
      executionContext: undefined,
      matchedReference: 'YouTube 下载',
      model: undefined,
      remainingQuery: 'https://youtu.be/demo',
      skillName: 'YouTube 下载'
    })
  })

  it('ignores slash invocations for non-user-invocable skills', () => {
    const registry = SkillRegistry.fromEntries([
      createEntry({
        name: '画像即时更新',
        userInvocable: false
      })
    ])

    expect(resolveExplicitSkillInvocation('/画像即时更新', registry)).toBeUndefined()
  })

  it('normalizes and resolves structured explicit skill invocation input', () => {
    const registry = SkillRegistry.fromEntries([
      createEntry({
        aliases: ['download'],
        name: 'YouTube 下载'
      })
    ])

    const requested = normalizeRequestedSkillInvocation({
      matchedReference: ' download ',
      remainingQuery: ' https://youtu.be/demo ',
      source: 'slash-command'
    })

    expect(requested).toEqual({
      matchedReference: 'download',
      remainingQuery: 'https://youtu.be/demo',
      source: 'slash-command'
    })
    expect(resolveRequestedSkillInvocation(requested!, registry)).toEqual({
      effort: undefined,
      executionContext: undefined,
      matchedReference: 'download',
      model: undefined,
      remainingQuery: 'https://youtu.be/demo',
      skillName: 'YouTube 下载'
    })
  })

  it('ignores invalid structured explicit skill invocation input', () => {
    const registry = SkillRegistry.fromEntries([createEntry({ name: '字幕翻译' })])

    expect(normalizeRequestedSkillInvocation({ matchedReference: '   ' })).toBeUndefined()
    expect(
      resolveRequestedSkillInvocation(
        {
          matchedReference: 'unknown-skill',
          remainingQuery: 'test',
          source: 'input'
        },
        registry
      )
    ).toBeUndefined()
  })

  it('builds a prompt block that forces the explicitly selected skill', () => {
    const prompt = buildExplicitSkillInvocationPrompt({
      effort: 'high',
      executionContext: 'fork',
      matchedReference: '字幕翻译',
      model: 'gpt-5.1',
      remainingQuery: '把这个字幕翻成英文',
      skillName: '字幕翻译'
    })

    expect(prompt).toContain('## Explicit Skill Invocation')
    expect(prompt).toContain("skillUseTool({ skill: '字幕翻译', mode: 'inline' })")
    expect(prompt).toContain('context: fork')
    expect(prompt).toContain('gpt-5.1')
    expect(prompt).toContain('high')
    expect(prompt).toContain('把这个字幕翻成英文')
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
