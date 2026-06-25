import { randomUUID } from 'node:crypto';

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { UserChoiceQuestion, UserChoiceRequest } from '../../../types';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const questionSchema = Type.Object({
  id: Type.String({ description: '题目唯一 ID' }),
  title: Type.String({ description: '题目标题' }),
  description: Type.Optional(Type.String({ description: '可选的补充说明' })),
  options: Type.Array(
    Type.Object({
      value: Type.String({ description: '选项值（返回给你）' }),
      label: Type.String({ description: '选项显示文本' }),
      description: Type.Optional(Type.String({ description: '选项补充描述' }))
    }),
    { minItems: 2, description: '至少两个选项' }
  ),
  multiple: Type.Optional(Type.Boolean({ description: '是否多选，默认 false（单选）' }))
});

const askUserParameters = Type.Object({
  prompt: Type.Optional(Type.String({ description: '顶部提示文本，告诉用户为什么需要选择' })),
  questions: Type.Array(questionSchema, { minItems: 1, description: '要问的选择题列表，支持多题' })
});

export function createPiAskUserTool(toolContext: PiSessionToolContext): ToolDefinition<typeof askUserParameters> {
  return {
    name: 'askUserTool',
    label: 'askUserTool',
    description: `向用户展示交互式选项卡，等待用户做出选择后继续。适用于需要用户确认、选择偏好或做决策的场景。

使用场景：
- 需要用户在多个方案中选择一个（单选）
- 需要用户勾选多个选项（多选）
- 需要用户分步做多个选择决策（多题）
- 需要确认操作前征求用户同意

注意：
- 每个 question 至少需要 2 个选项
- 单选时用户只能选一个，多选时可以选多个
- 多题会展示为可滑动的卡片，用户逐题选择
- 工具会阻塞等待用户回答，回答后才继续`,
    parameters: askUserParameters,
    async execute(toolCallId, input) {
      const { emitUserChoiceRequest, waitForUserChoiceResponse } = toolContext;

      if (!emitUserChoiceRequest || !waitForUserChoiceResponse) {
        return createJsonToolResult({
          success: false,
          error: '当前环境不支持交互式选项'
        });
      }

      const choiceId = randomUUID();
      const questions: UserChoiceQuestion[] = input.questions.map((q) => ({
        id: q.id,
        title: q.title,
        description: q.description,
        options: q.options,
        multiple: q.multiple
      }));

      const request: UserChoiceRequest = {
        choiceId,
        toolCallId,
        questions,
        prompt: input.prompt
      };

      // Emit the choice request to the UI via stream
      emitUserChoiceRequest(request);

      // Block until user responds
      const response = await waitForUserChoiceResponse(choiceId);

      return createJsonToolResult({
        success: true,
        choiceId,
        answers: response.answers
      });
    }
  };
}
