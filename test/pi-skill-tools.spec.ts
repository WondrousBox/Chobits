import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSkillRegistry, createSkillSessionState, loadSyntheticToolboxSkillEntries, SkillRegistry } from '../packages/ai/runtime/pi/skills'
import { createPiSkillSearchTool } from '../packages/ai/runtime/pi/tools/skill-search'
import { createPiSkillUseTool } from '../packages/ai/runtime/pi/tools/skill-use'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (targetPath) => {
      await fs.rm(targetPath, { force: true, recursive: true })
    })
  )
})

describe('skill tools', () => {
  it('searches project skills and loads them in preview/inline mode', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-skill-tools-'))
    tempRoots.push(tempRoot)

    const bundledRoot = path.join(tempRoot, 'bundled')
    const homeDir = path.join(tempRoot, 'home')
    const repoRoot = path.join(tempRoot, 'repo')
    const workspaceRoot = path.join(repoRoot, 'apps', 'demo')
    const skillFilePath = path.join(workspaceRoot, '.chobits', 'skills', 'subtitle-translate', 'SKILL.md')

    await fs.mkdir(path.join(repoRoot, '.git'), { recursive: true })
    await writeSkill(
      skillFilePath,
      `---
name: subtitle-translate
description: Reliable subtitle translation workflow.
when_to_use: When the user wants subtitle translation.
allowed-tools:
  - resourceQueryTool
  - translationTool
activation-tools:
  - translationTool
aliases:
  - 翻译字幕
argument-hint: resourceId, targetLanguage
arguments:
  - name: resourceId
  - name: targetLanguage
---
1. Read subtitle resource {{resourceId}}
2. Translate it into {{targetLanguage}}
3. Working directory: \${CHOBITS_SKILL_DIR}
4. Session: \${CHOBITS_SESSION_ID}
`
    )

    const registry = await createSkillRegistry({
      bundledSkillRoot: bundledRoot,
      homeDir,
      includeSyntheticToolbox: false,
      workspaceRoot
    })

    const toolContext = createMockToolContext(workspaceRoot, registry)
    const skillSearchTool = createPiSkillSearchTool(toolContext as any)
    const skillUseTool = createPiSkillUseTool(toolContext as any)

    const searchResult = (await executeTool(skillSearchTool, 'call-1', { action: 'search', query: '翻译字幕' })).details as any
    expect(searchResult.success).toBe(true)
    expect(searchResult.results).toHaveLength(1)
    expect(searchResult.results[0]).toMatchObject({
      activationToolIds: ['translate-subtitles'],
      allowedToolIds: ['query-resources', 'translate-subtitles'],
      executionContext: 'inline',
      isDiscovered: true,
      name: 'subtitle-translate'
    })
    expect(toolContext.skillSessionState.discoveredSkillNames.has('subtitle-translate')).toBe(true)

    const previewResult = (await executeTool(skillUseTool, 'call-2', {
      args: { resourceId: 'res-1', targetLanguage: 'English' },
      mode: 'preview',
      skill: '翻译字幕'
    })).details as any

    expect(previewResult.success).toBe(true)
    expect(previewResult.activatedToolNames).toEqual([])
    expect(previewResult.executionContext).toBe('inline')
    expect(previewResult.content).toContain('Translate it into English')
    expect(previewResult.content).toContain('Session: conv-1')
    expect(previewResult.content).toContain(path.join(workspaceRoot, '.chobits', 'skills', 'subtitle-translate'))
    expect(toolContext.session.getActiveToolNames()).toEqual(['skillSearchTool', 'skillUseTool'])

    const inlineResult = (await executeTool(skillUseTool, 'call-3', {
      args: { resourceId: 'res-2', targetLanguage: 'Japanese' },
      mode: 'inline',
      skill: 'subtitle-translate'
    })).details as any

    expect(inlineResult.success).toBe(true)
    expect(inlineResult.activatedToolNames).toEqual(['translationTool'])
    expect(toolContext.session.getActiveToolNames()).toEqual(['skillSearchTool', 'skillUseTool', 'translationTool'])
    expect(toolContext.skillSessionState.loadedSkillNames.has('subtitle-translate')).toBe(true)
    expect(toolContext.skillSessionState.activeSkillNames.has('subtitle-translate')).toBe(true)
    expect(toolContext.skillSessionState.activatedToolNames.has('translationTool')).toBe(true)
  })

  it('can use synthetic toolbox skills and activate their suggested tools', async () => {
    const synthetic = loadSyntheticToolboxSkillEntries()
    const registry = SkillRegistry.fromEntries(synthetic.entries, synthetic.issues)
    const toolContext = createMockToolContext(process.cwd(), registry)
    const skillUseTool = createPiSkillUseTool(toolContext as any)

    const result = (await executeTool(skillUseTool, 'call-4', {
      mode: 'inline',
      skill: '字幕翻译'
    })).details as any

    expect(result.success).toBe(true)
    expect(result.executionContext).toBe('inline')
    expect(result.skill).toBe('字幕翻译')
    expect(result.activatedToolNames).toEqual(['resourceQueryTool', 'translationTool'])
    expect(result.content).toContain('translationTool')
    expect(toolContext.skillSessionState.activeSkillNames.has('字幕翻译')).toBe(true)
  })

  it('surfaces fork/model/effort execution hints without activating the current session tools', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-skill-tools-fork-'))
    tempRoots.push(tempRoot)

    const bundledRoot = path.join(tempRoot, 'bundled')
    const homeDir = path.join(tempRoot, 'home')
    const workspaceRoot = path.join(tempRoot, 'repo')
    const skillFilePath = path.join(workspaceRoot, '.chobits', 'skills', 'forked-review', 'SKILL.md')

    await fs.mkdir(path.join(workspaceRoot, '.git'), { recursive: true })
    await writeSkill(
      skillFilePath,
      `---
name: forked-review
description: Run a deeper review workflow in a forked context.
allowed-tools:
  - resourceQueryTool
activation-tools:
  - resourceQueryTool
context: fork
model: gpt-5.1
effort: high
---
1. Review the target in a forked context.
`
    )

    const registry = await createSkillRegistry({
      bundledSkillRoot: bundledRoot,
      homeDir,
      includeSyntheticToolbox: false,
      workspaceRoot
    })

    const toolContext = createMockToolContext(workspaceRoot, registry)
    const skillSearchTool = createPiSkillSearchTool(toolContext as any)
    const skillUseTool = createPiSkillUseTool(toolContext as any)

    const searchResult = (await executeTool(skillSearchTool, 'call-5', { action: 'get', query: 'forked-review' })).details as any
    expect(searchResult.skill).toMatchObject({
      effort: 'high',
      executionContext: 'fork',
      model: 'gpt-5.1',
      name: 'forked-review'
    })

    const useResult = (await executeTool(skillUseTool, 'call-6', { mode: 'inline', skill: 'forked-review' })).details as any

    expect(useResult).toMatchObject({
      effort: 'high',
      executionContext: 'fork',
      model: 'gpt-5.1',
      skill: 'forked-review',
      success: true
    })
    expect(useResult.activatedToolNames).toEqual([])
    expect(useResult.warning).toContain('fork execution')
    expect(toolContext.session.getActiveToolNames()).toEqual(['skillSearchTool', 'skillUseTool'])
  })

  it('runs forked skills through the injected callback when the runtime provides one', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-skill-tools-fork-runner-'))
    tempRoots.push(tempRoot)

    const bundledRoot = path.join(tempRoot, 'bundled')
    const homeDir = path.join(tempRoot, 'home')
    const workspaceRoot = path.join(tempRoot, 'repo')
    const skillFilePath = path.join(workspaceRoot, '.chobits', 'skills', 'forked-review', 'SKILL.md')

    await fs.mkdir(path.join(workspaceRoot, '.git'), { recursive: true })
    await writeSkill(
      skillFilePath,
      `---
name: forked-review
description: Run a deeper review workflow in a forked context.
allowed-tools:
  - resourceQueryTool
activation-tools:
  - resourceQueryTool
context: fork
model: gpt-5.1
effort: high
---
1. Review the target in a forked context.
`
    )

    const registry = await createSkillRegistry({
      bundledSkillRoot: bundledRoot,
      homeDir,
      includeSyntheticToolbox: false,
      workspaceRoot
    })

    const runForkedSkill = vi.fn().mockResolvedValue({
      activeToolNames: ['resourceQueryTool'],
      content: 'forked child finished',
      model: 'gpt-5.1',
      thinkingLevel: 'high'
    })
    const toolContext = createMockToolContext(workspaceRoot, registry, { runForkedSkill })
    const skillUseTool = createPiSkillUseTool(toolContext as any)

    const useResult = (await executeTool(skillUseTool, 'call-7', { mode: 'inline', skill: 'forked-review' })).details as any

    expect(runForkedSkill).toHaveBeenCalledTimes(1)
    expect(runForkedSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        executionContext: 'fork',
        model: 'gpt-5.1',
        record: expect.objectContaining({ name: 'forked-review' })
      }),
      { toolCallId: 'call-7' }
    )
    expect(useResult.forkedExecution).toMatchObject({
      activeToolNames: ['resourceQueryTool'],
      content: 'forked child finished',
      model: 'gpt-5.1',
      thinkingLevel: 'high'
    })
    expect(useResult.warning).toBeUndefined()
    expect(toolContext.session.getActiveToolNames()).toEqual(['skillSearchTool', 'skillUseTool'])
  })
})

function createMockToolContext(workspaceRoot: string, registry: SkillRegistry, overrides: Record<string, unknown> = {}) {
  const activeToolNames = ['skillSearchTool', 'skillUseTool']

  return {
    coding: {
      label: path.basename(workspaceRoot),
      mode: 'safe',
      rootPath: workspaceRoot,
      source: 'manual'
    },
    conversationId: 'conv-1',
    resolved: {},
    session: {
      getActiveToolNames: () => [...activeToolNames],
      getAllTools: () => activeToolNames.map((name) => ({ description: name, name })),
      setActiveToolsByName: (names: string[]) => {
        activeToolNames.splice(0, activeToolNames.length, ...names)
      }
    },
    skillRegistry: registry,
    skillSessionState: createSkillSessionState(),
    ...overrides
  }
}

async function writeSkill(skillFilePath: string, content: string) {
  await fs.mkdir(path.dirname(skillFilePath), { recursive: true })
  await fs.writeFile(skillFilePath, content, 'utf8')
}

async function executeTool(tool: any, toolCallId: string, input: any) {
  return tool.execute(toolCallId, input)
}
