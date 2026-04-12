import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { WorkspacesRepo } from '@packages/common/db';
import { Type } from '@sinclair/typebox';

import type { PersonaCandidateFact, PersonaChatFn, PersonaUpdateJobParams, PersonaUpdateReason } from '../../../services/persona-types';
import { updatePersona } from '../../../services/persona-update-service';
import { createManagedTaskChatFn, LONG_TASK_CHAT_TIMEOUTS } from '../../../services/task-chat-runner';
import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../task-chat';
import { buildNonReasoningTaskRuntimeRequest } from '../task-model-policy';
import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const personaUpdateParameters = Type.Object({
  candidateFacts: Type.Array(
    Type.Object({
      dimension: Type.Union(
        [Type.Literal('basic'), Type.Literal('preference'), Type.Literal('goal'), Type.Literal('personality'), Type.Literal('decision'), Type.Literal('activity'), Type.Literal('recent')],
        { description: '画像维度' }
      ),
      statement: Type.String({ description: '画像事实描述' }),
      confidence: Type.Number({ description: '置信度 0.0~1.0', minimum: 0, maximum: 1 })
    }),
    {
      description: '要更新的画像候选事实列表',
      minItems: 1
    }
  ),
  reason: Type.Optional(
    Type.String({
      description: '更新原因：new_stable_preference / new_goal_or_priority / communication_style_shift / conflict_resolution / recent_activity_update'
    })
  )
});

function adaptChatFn(piChatFn: PiTaskChatFunction): PersonaChatFn {
  return createManagedTaskChatFn(piChatFn, {
    tag: '[PersonaUpdateTool]',
    timeouts: LONG_TASK_CHAT_TIMEOUTS
  });
}

/**
 * Agent-initiated persona update tool.
 *
 * 当 Agent 在对话中识别到重要的用户偏好、目标变化、活动更新等，
 * 但自动画像更新尚未触发（冷却中、消息数不足等），可以主动调用此工具
 * 立即将候选事实提交到用户画像（USER_PERSONA.md）。
 *
 * 与自动触发路径的区别：
 * - 跳过 gate / cooldown 检查
 * - 跳过 LLM 判定步骤（Agent 已在对话上下文中判断需要更新）
 * - 直接执行 persona update
 */
export function createPiPersonaUpdateTool(toolContext: PiSessionToolContext): ToolDefinition<typeof personaUpdateParameters> {
  return {
    name: 'personaUpdateTool',
    label: 'personaUpdateTool',
    description:
      '主动更新用户画像（USER_PERSONA.md）。当你在对话中发现了用户的重要偏好、目标、个性特征、近期活动变化等画像信息，但还没有被自动记录时，使用此工具立即更新。不要频繁调用——仅在确实识别到有价值的画像变化时使用。',
    parameters: personaUpdateParameters,

    async execute(_toolCallId, input) {
      const TAG = '[PersonaUpdateTool]';
      try {
        const workspaceId = await resolveWorkspaceId(toolContext);
        if (!workspaceId) {
          return createJsonToolResult({ success: false, error: 'No active workspace' });
        }

        const ws = await WorkspacesRepo.getById(workspaceId);
        if (!ws?.rootPath) {
          return createJsonToolResult({ success: false, error: 'Workspace root path not found' });
        }

        // Build provider info from current session
        const providerId = toolContext.resolved?.model?.providerId;
        if (!providerId) {
          return createJsonToolResult({ success: false, error: 'No provider available for LLM call' });
        }

        const providerPresetId = toolContext.resolved?.model?.presetId;
        const conversationId = toolContext.conversationId;

        // Build candidate facts
        const candidateFacts: PersonaCandidateFact[] = input.candidateFacts.map((f) => ({
          dimension: f.dimension,
          statement: f.statement,
          confidence: f.confidence
        }));

        const reason: PersonaUpdateReason = (input.reason as PersonaUpdateReason) || 'new_stable_preference';

        // Build update job params
        const jobParams: PersonaUpdateJobParams = {
          workspaceId,
          evidence: conversationId ? [{ conversationId, seqStart: 0, seqEnd: 0 }] : [],
          candidateFacts,
          reason,
          providerId,
          providerPresetId
        };

        // Create LLM runtime for persona update
        console.log(`${TAG} Creating LLM runtime for agent-initiated persona update: provider=${providerId}`);
        const runtime = await createPiTaskChatRuntimeFromRequest(
          buildNonReasoningTaskRuntimeRequest({
            providerId,
            providerPresetId,
            agentId: 'user-persona-update',
            maxTokens: 2000
          })
        );
        const chatFn = adaptChatFn(runtime.chatFn);

        // Execute persona update directly (bypass queue for immediate effect)
        console.log(`${TAG} Executing persona update: ${candidateFacts.length} facts, reason=${reason}`);
        const result = await updatePersona(jobParams, chatFn, ws.rootPath);

        console.log(`${TAG} Persona update completed: action=${result.action}, chars=${result.charCount}, items=${result.itemCount}`);

        return createJsonToolResult({
          success: true,
          action: result.action,
          charCount: result.charCount,
          itemCount: result.itemCount,
          factCount: candidateFacts.length,
          reason,
          message: `用户画像已更新：${candidateFacts.map((f) => f.statement).join('；')}`
        });
      } catch (error: any) {
        console.error(`${TAG} Persona update failed:`, error?.message || error);
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to update persona'
        });
      }
    }
  };
}
