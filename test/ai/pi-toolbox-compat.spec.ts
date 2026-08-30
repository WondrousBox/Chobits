import { describe, expect, it } from 'vitest'

import { createSkillRegistry, createSkillSessionState } from '../../packages/ai/runtime/pi/skills'
import { createPiToolboxLookupTool } from '../../packages/ai/runtime/pi/tools/toolbox-lookup'

describe('toolbox compatibility layer', () => {
  it('the repo no longer ships bundled tool-wrapper skills by default', async () => {
    const registry = await createSkillRegistry({
      includeSyntheticToolbox: false,
      includeProject: false,
      includeUserGlobal: false,
      workspaceRoot: process.cwd()
    })

    expect(registry.list()).toEqual([])
  })

  it('keeps toolbox list/get/search on the legacy markdown flow even when a skill registry is attached', async () => {
    const registry = await createSkillRegistry({
      includeProject: false,
      includeUserGlobal: false,
      workspaceRoot: process.cwd()
    })
    const toolContext = createMockToolContext(process.cwd(), registry)
    const toolboxTool = createPiToolboxLookupTool(toolContext as any)

    const listResult = (await toolboxTool.execute('call-1', { action: 'list' })).details as any
    const listedSkill = listResult.skills.find((skill: any) => skill.name === '网络搜索与网页读取')

    expect(listResult.success).toBe(true)
    expect(listedSkill.name).toBe('网络搜索与网页读取')
    expect(listedSkill.triggers).toContain('搜索')
    expect(listedSkill.tools).toEqual(expect.arrayContaining(['webSearchTool', 'webReadTool']))

    const getResult = (await toolboxTool.execute('call-2', { action: 'get', query: '网络搜索与网页读取' })).details as any

    expect(getResult).toMatchObject({
      success: true,
      name: '网络搜索与网页读取'
    })
    expect(getResult.content).toContain('**工作流程：**')
    expect(getResult.content).not.toContain('## 工作流程')

    const searchResult = (await toolboxTool.execute('call-3', { action: 'search', query: '网页' })).details as any

    expect(searchResult.success).toBe(true)
    expect(searchResult.results[0].name).toBe('网络搜索与网页读取')
    expect(searchResult.results[0].content).toContain('**工作流程：**')
    expect(searchResult.results[0].content).not.toContain('## 工作流程')
    expect(searchResult.activatedTools).toEqual(expect.arrayContaining(['webSearchTool', 'webReadTool']))
    expect(toolContext.session.getActiveToolNames()).toEqual(expect.arrayContaining(['toolboxTool', 'webSearchTool', 'webReadTool']))
  })

  it('falls back to legacy toolbox parsing when no skill registry is present', async () => {
    const toolContext = createMockToolContext(process.cwd())
    const toolboxTool = createPiToolboxLookupTool(toolContext as any)

    const searchResult = (await toolboxTool.execute('call-4', { action: 'search', query: '网页' })).details as any

    expect(searchResult.success).toBe(true)
    expect(searchResult.results[0].name).toBe('网络搜索与网页读取')
    expect(searchResult.results[0].content).toContain('**工作流程：**')
    expect(searchResult.results[0].content).not.toContain('## 工作流程')
    expect(searchResult.activatedTools).toEqual(expect.arrayContaining(['webSearchTool', 'webReadTool']))
    expect(toolContext.session.getActiveToolNames()).toEqual(expect.arrayContaining(['toolboxTool', 'webSearchTool', 'webReadTool']))
  })
})

function createMockToolContext(workspaceRoot: string, skillRegistry?: Awaited<ReturnType<typeof createSkillRegistry>>) {
  const activeToolNames = ['toolboxTool']

  return {
    coding: {
      label: 'demo',
      mode: 'safe',
      rootPath: workspaceRoot,
      source: 'manual'
    },
    conversationId: 'conv-toolbox',
    resolved: {},
    session: {
      getActiveToolNames: () => [...activeToolNames],
      getAllTools: () => activeToolNames.map((name) => ({ description: name, name })),
      setActiveToolsByName: (names: string[]) => {
        activeToolNames.splice(0, activeToolNames.length, ...names)
      }
    },
    skillRegistry,
    skillSessionState: createSkillSessionState()
  }
}
