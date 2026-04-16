import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import type { PiSessionToolContext } from '../tool-context';
import { listPiToolDescriptors } from '../tool-registry';
import { getToolboxSkill, listToolboxSkills, searchToolbox } from '../toolbox';
import { createJsonToolResult } from './result';

const toolboxParameters = Type.Object({
  action: Type.Union([Type.Literal('search'), Type.Literal('list'), Type.Literal('get'), Type.Literal('activate'), Type.Literal('deactivate')], {
    description: 'search=按意图搜索技能并自动激活相关工具, list=列出所有技能概览, get=按名称获取技能详情, activate=手动激活指定工具, deactivate=停用指定工具'
  }),
  query: Type.Optional(
    Type.String({
      description: 'search 时的搜索查询，get 时填技能名称'
    })
  ),
  toolNames: Type.Optional(
    Type.Array(Type.String(), {
      description: 'activate/deactivate 时使用，要激活或停用的工具名称列表'
    })
  )
});

/** 从技能的 tools 列表中解析出工具名 */
function extractToolNamesFromSkills(skills: Array<{ tools: string[] }>): string[] {
  const names = new Set<string>();
  for (const skill of skills) {
    for (const tool of skill.tools) {
      names.add(tool);
    }
  }
  return Array.from(names);
}

export function createPiToolboxLookupTool(toolContext: PiSessionToolContext): ToolDefinition<typeof toolboxParameters> {
  return {
    name: 'toolboxTool',
    label: 'toolboxTool',
    description: '工具箱 — 管理你的所有能力。遇到需要操作的任务时，先用 search 搜索相关技能，工具会自动激活。激活后你可以直接调用这些工具。',
    parameters: toolboxParameters,

    async execute(_toolCallId, input) {
      const { action, query, toolNames } = input;
      console.log('[toolbox] called:', { action, query: query || undefined, toolNames: toolNames || undefined });

      // ━━ list ━━
      if (action === 'list') {
        const skills = listToolboxSkills();
        if (!skills.length) {
          return createJsonToolResult({ success: true, skills: [], message: '工具箱为空' });
        }
        const activeTools = toolContext.session?.getActiveToolNames() || [];
        console.log('[toolbox] list →', skills.map((s) => s.name).join(', '));
        return createJsonToolResult({
          success: true,
          skills: skills.map((s) => ({
            name: s.name,
            triggers: s.triggers,
            tools: s.tools
          })),
          activeTools
        });
      }

      // ━━ get ━━
      if (action === 'get') {
        if (!query) {
          return createJsonToolResult({ success: false, error: 'get 需要提供技能名称（query）' });
        }
        const skill = getToolboxSkill(query);
        if (!skill) {
          return createJsonToolResult({
            success: false,
            error: `未找到"${query}"`,
            availableSkills: listToolboxSkills().map((s) => s.name)
          });
        }
        return createJsonToolResult({ success: true, name: skill.name, content: skill.content });
      }

      // ━━ search (auto-activate) ━━
      if (action === 'search') {
        if (!query) {
          return createJsonToolResult({ success: false, error: 'search 需要提供查询（query）' });
        }
        const results = searchToolbox(query);
        if (!results.length) {
          return createJsonToolResult({
            success: true,
            results: [],
            message: `没有找到与"${query}"相关的技能`,
            availableSkills: listToolboxSkills().map((s) => s.name)
          });
        }

        console.log('[toolbox] search →', query, '命中:', results.map((s) => s.name).join(', '));

        // Auto-activate tools from matched skills
        const matchedToolNames = extractToolNamesFromSkills(results);
        let activated: string[] = [];
        if (matchedToolNames.length > 0 && toolContext.session) {
          const currentActive = toolContext.session.getActiveToolNames();
          const newActive = Array.from(new Set([...currentActive, ...matchedToolNames]));
          toolContext.session.setActiveToolsByName(newActive);
          activated = matchedToolNames.filter((n) => !currentActive.includes(n));
          if (activated.length > 0) {
            console.log('[toolbox] auto-activated:', activated.join(', '));
          }
        }

        return createJsonToolResult({
          success: true,
          results: results.map((s) => ({
            name: s.name,
            content: s.content
          })),
          activatedTools: activated.length > 0 ? activated : undefined,
          hint: activated.length > 0 ? `已激活工具: ${activated.join(', ')}。你现在可以直接调用这些工具了。` : undefined
        });
      }

      // ━━ activate ━━
      if (action === 'activate') {
        if (!toolNames?.length) {
          return createJsonToolResult({
            success: false,
            error: 'activate 需要提供 toolNames',
            availableTools: listPiToolDescriptors()
              .map((tool) => tool.compatName || tool.name)
              .filter(Boolean)
          });
        }

        if (!toolContext.session) {
          return createJsonToolResult({ success: false, error: '会话未就绪，无法激活工具' });
        }

        const currentActive = toolContext.session.getActiveToolNames();
        const newActive = Array.from(new Set([...currentActive, ...toolNames]));
        toolContext.session.setActiveToolsByName(newActive);
        const nowActive = toolContext.session.getActiveToolNames();
        console.log('[toolbox] activated →', toolNames.join(', '), '| now active:', nowActive.join(', '));
        return createJsonToolResult({
          success: true,
          activeTools: nowActive,
          message: `已激活: ${toolNames.join(', ')}，下一轮可以直接调用`
        });
      }

      // ━━ deactivate ━━
      if (action === 'deactivate') {
        if (!toolNames?.length) {
          return createJsonToolResult({ success: false, error: 'deactivate 需要提供 toolNames' });
        }

        if (!toolContext.session) {
          return createJsonToolResult({ success: false, error: '会话未就绪，无法停用工具' });
        }

        const removeSet = new Set(toolNames);
        // 永远不能停用 toolboxTool 和 askUserTool
        removeSet.delete('toolboxTool');
        removeSet.delete('askUserTool');

        const currentActive = toolContext.session.getActiveToolNames();
        const newActive = currentActive.filter((name) => !removeSet.has(name));
        toolContext.session.setActiveToolsByName(newActive);
        const nowActive = toolContext.session.getActiveToolNames();
        console.log('[toolbox] deactivated →', toolNames.join(', '), '| now active:', nowActive.join(', '));
        return createJsonToolResult({
          success: true,
          activeTools: nowActive,
          message: `已停用: ${Array.from(removeSet).join(', ')}`
        });
      }

      return createJsonToolResult({ success: false, error: `未知 action: ${action}` });
    }
  };
}
