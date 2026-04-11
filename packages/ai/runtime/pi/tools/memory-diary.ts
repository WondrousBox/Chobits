import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { WorkspacesRepo } from '@packages/common/db';
import { Type } from '@sinclair/typebox';

import { getTodayMemoryDate } from '../../../services/memory-date';
import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memoryDiaryParameters = Type.Object({
  entry: Type.String({ description: '日记内容：记录本次对话中的观察、学到的东西、处理策略等经验总结' }),
  tags: Type.Optional(Type.Array(Type.String(), { description: '可选标签，用于分类检索，如「调试技巧」「用户偏好」' }))
});

/**
 * I-7: Agent Diary Tool — AI 在对话结束时写入观察和经验日记。
 * 日记条目写入 memory/diary/YYYY-MM-DD.md，追加形式。
 */
export function createPiMemoryDiaryTool(toolContext: PiSessionToolContext): ToolDefinition<typeof memoryDiaryParameters> {
  return {
    name: 'memoryDiaryTool',
    label: 'memoryDiaryTool',
    description: '写入 AI 助手日记。在对话中有值得记录的观察、学到的经验、处理策略时使用。日记帮助你在未来的对话中更好地服务用户。不要在每次对话都写日记，只在有真正的洞察时才写。',
    parameters: memoryDiaryParameters,

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

        const date = getTodayMemoryDate();
        const diaryDir = path.join(ws.rootPath, 'memory', 'diary');
        await fs.mkdir(diaryDir, { recursive: true });

        const diaryFile = path.join(diaryDir, `${date}.md`);
        const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
        const tagsStr = input.tags?.length ? ` [${input.tags.join(', ')}]` : '';
        const entryBlock = `\n### ${timestamp}${tagsStr}\n\n${input.entry.trim()}\n`;

        // Check if file exists, add header if not
        let fileExists = true;
        try {
          await fs.access(diaryFile);
        } catch {
          fileExists = false;
        }

        if (!fileExists) {
          const header = `# Agent Diary — ${date}\n`;
          await fs.writeFile(diaryFile, header + entryBlock, 'utf-8');
        } else {
          await fs.appendFile(diaryFile, entryBlock, 'utf-8');
        }

        return createJsonToolResult({
          success: true,
          date,
          file: `memory/diary/${date}.md`,
          message: '日记已记录'
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to write diary'
        });
      }
    }
  };
}
