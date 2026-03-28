import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { getWorkflow, listAllWorkflowDefinitions, runWorkflow } from '../../../../workflow';
import type { WorkflowDefinition } from '../../../../workflow/types';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

// ============================================================================
// 辅助函数：提取工作流摘要信息（供 AI 查找使用）
// ============================================================================

interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  inputMode?: string;
  acceptedResourceKinds?: string[];
  coreNodeTypes: string[];
  isPreset: boolean;
}

function extractWorkflowSummary(def: WorkflowDefinition): WorkflowSummary {
  const startNode = def.nodes.find((n) => n.type === 'core/start');
  const inputMode = (startNode?.config?.inputMode as string) || 'resource';
  const resourceKinds: string[] = (startNode?.config?.resourceKinds as string[]) || [];

  const utilityTypes = new Set(['core/start', 'core/end', 'resource/load', 'resource/create', 'resource/update']);
  const coreNodeTypes = [...new Set(def.nodes.map((n) => n.type).filter((t) => !utilityTypes.has(t)))];

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    inputMode,
    acceptedResourceKinds: resourceKinds.length > 0 ? resourceKinds : undefined,
    coreNodeTypes,
    isPreset: !!def.isPreset
  };
}

// ============================================================================
// 工具参数定义
// ============================================================================

const workflowRunParameters = Type.Object({
  action: Type.Union([Type.Literal('search'), Type.Literal('list'), Type.Literal('run')], {
    description: 'list=列出所有可用工作流及其用途, search=按关键词搜索合适的工作流, run=执行指定工作流'
  }),
  query: Type.Optional(Type.String({ description: 'search 时的搜索关键词（如"转写"、"字幕"、"OCR"、"关键帧"等），匹配工作流名称和描述' })),
  workflowId: Type.Optional(Type.String({ description: 'run 时必填，要执行的工作流 ID（从 list/search 结果中获取）' })),
  input: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: 'run 时的输入参数。resource 模式需要 resourceId；text 模式需要 text；url 模式需要 url；file 模式需要 file 路径'
      }
    )
  ),
  configOverrides: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: '可选，覆盖工作流中节点的默认配置。格式: { "节点ID": { "配置项": "值" } }'
      }
    )
  )
});

// ============================================================================
// 工具实现
// ============================================================================

export function createPiWorkflowRunTool(_toolContext: PiSessionToolContext): ToolDefinition<typeof workflowRunParameters> {
  void _toolContext;

  return {
    name: 'workflowRunTool',
    label: 'workflowRunTool',
    description:
      '查找和执行工作流。工作流可以完成 AI 无法直接做的任务，如：视频转写（语音转文字）、音频提取、OCR 文字识别、提取视频关键帧、AI 图片生成等。action: list（列出所有工作流）、search（按关键词搜索）、run（执行工作流）。',
    parameters: workflowRunParameters,

    async execute(_toolCallId, input) {
      const { action, query, workflowId, input: workflowInput, configOverrides } = input;
      console.log('[workflowRunTool] called:', { action, query, workflowId });

      if (action === 'list') {
        try {
          const allDefs = await listAllWorkflowDefinitions();
          const summaries = allDefs.filter((d) => d.id !== 'blank').map(extractWorkflowSummary);
          return createJsonToolResult({ success: true, workflows: summaries, total: summaries.length });
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || '加载工作流列表失败' });
        }
      }

      if (action === 'search') {
        if (!query) {
          return createJsonToolResult({ success: false, error: 'search 操作需要提供搜索关键词（query 参数）' });
        }
        try {
          const allDefs = await listAllWorkflowDefinitions();
          const q = query.toLowerCase();
          const matched = allDefs
            .filter((d) => d.id !== 'blank')
            .filter((d) => {
              const name = (d.name || '').toLowerCase();
              const desc = (d.description || '').toLowerCase();
              const nodeTypes = d.nodes.map((n) => n.type.toLowerCase()).join(' ');
              return name.includes(q) || desc.includes(q) || nodeTypes.includes(q);
            })
            .map(extractWorkflowSummary);

          if (matched.length === 0) {
            const allSummaries = allDefs.filter((d) => d.id !== 'blank').map(extractWorkflowSummary);
            return createJsonToolResult({ success: true, results: [], message: `没有找到与"${query}"匹配的工作流`, allWorkflows: allSummaries });
          }
          return createJsonToolResult({ success: true, results: matched });
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || '搜索工作流失败' });
        }
      }

      if (action === 'run') {
        if (!workflowId) {
          return createJsonToolResult({ success: false, error: 'run 操作需要提供 workflowId（从 list/search 结果中获取）' });
        }
        try {
          const def = await getWorkflow(workflowId);
          if (!def) {
            return createJsonToolResult({ success: false, error: `未找到工作流 "${workflowId}"`, hint: '请先使用 list 或 search 查看可用工作流' });
          }

          const runInput: Record<string, any> = { ...(workflowInput || {}) };
          if (configOverrides) {
            runInput.__configOverrides__ = configOverrides;
          }

          const rec = await runWorkflow(def, runInput);
          return createJsonToolResult({
            success: true,
            runId: rec.runId,
            workflowId: rec.workflowId,
            status: rec.status,
            message: `工作流"${def.name}"已启动执行，运行 ID: ${rec.runId}`
          });
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || '执行工作流失败' });
        }
      }

      return createJsonToolResult({ success: false, error: `未知操作: ${action}` });
    }
  };
}
