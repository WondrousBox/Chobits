import { describe, expect, it } from 'vitest'

import { createSkillRegistry, createSkillSessionState } from '../packages/ai/runtime/pi/skills'
import { createPiToolboxLookupTool } from '../packages/ai/runtime/pi/tools/toolbox-lookup'

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
    const listedSkill = listResult.skills.find((skill: any) => skill.name === '字幕翻译')

    expect(listResult.success).toBe(true)
    expect(listedSkill.name).toBe('字幕翻译')
    expect(listedSkill.triggers).toContain('翻译字幕')
    expect(listedSkill.tools).toEqual(expect.arrayContaining(['resourceQueryTool', 'translationTool']))

    const getResult = (await toolboxTool.execute('call-2', { action: 'get', query: '字幕翻译' })).details as any

    expect(getResult).toMatchObject({
      success: true,
      name: '字幕翻译'
    })
    expect(getResult.content).toContain('**工作流程：**')
    expect(getResult.content).not.toContain('## 工作流程')

    const searchResult = (await toolboxTool.execute('call-3', { action: 'search', query: '翻译字幕' })).details as any

    expect(searchResult.success).toBe(true)
    expect(searchResult.results[0].name).toBe('字幕翻译')
    expect(searchResult.results[0].content).toContain('**工作流程：**')
    expect(searchResult.results[0].content).not.toContain('## 工作流程')
    expect(searchResult.activatedTools).toEqual(expect.arrayContaining(['resourceQueryTool', 'translationTool']))
    expect(toolContext.session.getActiveToolNames()).toEqual(expect.arrayContaining(['toolboxTool', 'resourceQueryTool', 'translationTool']))
  })

  it('falls back to legacy toolbox parsing when no skill registry is present', async () => {
    const toolContext = createMockToolContext(process.cwd())
    const toolboxTool = createPiToolboxLookupTool(toolContext as any)

    const searchResult = (await toolboxTool.execute('call-4', { action: 'search', query: '翻译字幕' })).details as any

    expect(searchResult.success).toBe(true)
    expect(searchResult.results[0].name).toBe('字幕翻译')
    expect(searchResult.results[0].content).toContain('**工作流程：**')
    expect(searchResult.results[0].content).not.toContain('## 工作流程')
    expect(searchResult.activatedTools).toEqual(expect.arrayContaining(['resourceQueryTool', 'translationTool']))
    expect(toolContext.session.getActiveToolNames()).toEqual(expect.arrayContaining(['toolboxTool', 'resourceQueryTool', 'translationTool']))
  })

  it('surfaces the chained media workflow playbook for video comprehension requests', async () => {
    const toolContext = createMockToolContext(process.cwd())
    const toolboxTool = createPiToolboxLookupTool(toolContext as any)

    const searchResult = (await toolboxTool.execute('call-chain', { action: 'search', query: '看不懂这个 YouTube 视频 帮我下载转写翻译' })).details as any

    expect(searchResult.success).toBe(true)
    expect(searchResult.results[0].name).toBe('链式资源处理')
    expect(searchResult.results[0].content).toContain('下载视频 -> 转写/提取字幕 -> 翻译字幕')
    expect(searchResult.results[0].content).toContain('不要按标题搜索资源')
    expect(searchResult.results[0].content).toContain('不要为了继续处理刚下载或刚转写出来的资源而调用 `resourceQueryTool`')
    expect(searchResult.activatedTools).toEqual(expect.arrayContaining(['youtubeDownloadTool', 'workflowRunTool', 'translationTool']))
    expect(toolContext.session.getActiveToolNames()).toEqual(expect.arrayContaining(['toolboxTool', 'youtubeDownloadTool', 'workflowRunTool', 'translationTool']))
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
