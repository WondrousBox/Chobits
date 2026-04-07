import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { WorkspacesRepo } from '@packages/common/db';
import { Type } from '@sinclair/typebox';

import { getTodayMemoryDate } from '../../../services/memory-date';
import { writeMemory } from '../../../services/memory-extraction-service';
import { buildNotePath, generateNoteId } from '../../../services/memory-note-writer';
import type { MemoryNoteFrontmatter, MergedNote } from '../../../services/memory-types';
import type { PiSessionToolContext } from '../tool-context';
import { buildWriteDbOps, resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memorySaveParameters = Type.Object({
  topic: Type.String({ description: '记忆主题标签，简短概括，如「用户偏好」「项目计划」「技术决策」' }),
  content: Type.String({ description: '要保存的记忆内容（Markdown 格式），包含用户想要记住的核心信息' }),
  keywords: Type.Array(Type.String(), { description: '关键词列表，至少 2 个，用于日后检索', minItems: 2 }),
  importance: Type.Optional(Type.Number({ description: '重要度 0.0~1.0，默认 0.7', minimum: 0, maximum: 1 })),
  summary: Type.Optional(Type.String({ description: '一句话摘要，不提供则自动截取 content 开头' }))
});

export function createPiMemorySaveTool(toolContext: PiSessionToolContext): ToolDefinition<typeof memorySaveParameters> {
  return {
    name: 'memorySaveTool',
    label: 'memorySaveTool',
    description:
      '将重要信息保存到长期记忆。两种使用场景：1) 用户明确要求记住（说"记住"、"帮我记一下"等）；2) 对话中出现了值得长期记录的重要内容（如用户偏好、重要决策、项目计划、技术方案等），应主动保存。不要保存临时闲聊或通用知识问答。',
    parameters: memorySaveParameters,

    async execute(_toolCallId, input) {
      try {
        const workspaceId = await resolveWorkspaceId(toolContext);
        if (!workspaceId) {
          return createJsonToolResult({ success: false, error: 'No active workspace' });
        }

        const ws = await WorkspacesRepo.getById(workspaceId);
        if (!ws?.rootPath) {
          return createJsonToolResult({ success: false, error: 'Workspace root path not found' });
        }

        const now = Date.now();
        const date = getTodayMemoryDate();
        const topicSlug = slugify(input.topic);
        const noteId = generateNoteId(date, topicSlug);
        const filePath = buildNotePath(date, topicSlug);
        const conversationId = toolContext.conversationId;

        const summary = input.summary || input.content.slice(0, 200).replace(/\n/g, ' ').trim();

        const frontmatter: MemoryNoteFrontmatter = {
          id: noteId,
          version: 1,
          workspaceId,
          date,
          topics: [input.topic],
          keywords: input.keywords,
          summary,
          sourceConversationIds: conversationId ? [conversationId] : [],
          importance: input.importance ?? 0.7,
          stability: 0.8,
          createdAt: now,
          updatedAt: now
        };

        const sections = new Map<string, string>();
        sections.set('Key Points', input.content);

        const merged: MergedNote = {
          action: 'create',
          noteId,
          frontmatter,
          sections,
          filePath
        };

        await writeMemory(merged, { workspaceRoot: ws.rootPath }, buildWriteDbOps());

        return createJsonToolResult({
          success: true,
          noteId: merged.noteId,
          topic: input.topic,
          filePath,
          message: `记忆已保存：${input.topic}`
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to save memory'
        });
      }
    }
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
