import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import type { PiSessionToolContext } from '../tool-context';
import { getToolboxSkill, listToolboxSkills, searchToolbox } from '../toolbox';
import { createJsonToolResult } from './result';

const toolboxLookupParameters = Type.Object({
  action: Type.Union([Type.Literal('search'), Type.Literal('list'), Type.Literal('get')], {
    description: 'search=根据用户意图搜索相关技能, list=列出所有技能概览, get=按名称获取某个技能的完整说明'
  }),
  query: Type.Optional(
    Type.String({
      description: 'search 时的搜索查询（用户意图描述或关键词），get 时填技能名称'
    })
  )
});

export function createPiToolboxLookupTool(_toolContext: PiSessionToolContext): ToolDefinition<typeof toolboxLookupParameters> {
  void _toolContext;

  return {
    name: 'toolboxLookupTool',
    label: 'toolboxLookupTool',
    description:
      '查找工具箱中的技能使用说明。当你不确定某个工具怎么用、需要了解工作流程、或用户要求的操作你不熟悉时，先查一下工具箱。action: search（按意图搜索）、list（列出所有技能）、get（按名称获取详情）。',
    parameters: toolboxLookupParameters,

    async execute(_toolCallId, input) {
      const { action, query } = input;
      console.log('toolboxLookupTool called with action:', action, 'query:', query);

      if (action === 'list') {
        const skills = listToolboxSkills();
        if (!skills.length) {
          return createJsonToolResult({
            success: true,
            skills: [],
            message: '工具箱为空'
          });
        }
        return createJsonToolResult({
          success: true,
          skills: skills.map((s) => ({
            name: s.name,
            triggers: s.triggers,
            tools: s.tools
          }))
        });
      }

      if (action === 'get') {
        if (!query) {
          return createJsonToolResult({
            success: false,
            error: 'get 操作需要提供技能名称（query 参数）'
          });
        }
        const skill = getToolboxSkill(query);
        if (!skill) {
          return createJsonToolResult({
            success: false,
            error: `未找到名为"${query}"的技能`,
            availableSkills: listToolboxSkills().map((s) => s.name)
          });
        }
        return createJsonToolResult({
          success: true,
          name: skill.name,
          content: skill.content
        });
      }

      // action === 'search'
      if (!query) {
        return createJsonToolResult({
          success: false,
          error: 'search 操作需要提供搜索查询（query 参数）'
        });
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

      return createJsonToolResult({
        success: true,
        results: results.map((s) => ({
          name: s.name,
          content: s.content
        }))
      });
    }
  };
}
