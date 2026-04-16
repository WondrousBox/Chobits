import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { WorkspacesRepo } from '@packages/common/db';
import { Type } from '@sinclair/typebox';

import { getTodayMemoryDate } from '../../../services/memory-date';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memoryDiaryParameters = Type.Object({
  entry: Type.String({ description: '日志内容：记录本次对话中的观察、学到的东西、处理策略等经验总结。仅写入 diary 日志，不会进入长期记忆检索。' }),
  tags: Type.Optional(Type.Array(Type.String(), { description: '可选标签，用于人工分类浏览，如「调试技巧」「用户偏好」' }))
});

/**
 * I-7: Agent Diary Tool — 当前明确作为 log-only 日志面保留。
 * 日记条目写入 memory/diary/YYYY-MM-DD.md，追加形式。
 * 不进入 memory DB / FTS / auto-recall / topic graph。
 */
export function createPiMemoryDiaryTool(toolContext: PiSessionToolContext): ToolDefinition<typeof memoryDiaryParameters> {
  return {
    name: 'memoryDiaryTool',
    label: 'memoryDiaryTool',
    description:
      '写入 AI 助手日志。在对话中有值得记录的观察、学到的经验、处理策略时使用。该工具只会追加写入 `memory/diary/YYYY-MM-DD.md` 日志文件，不会进入长期记忆检索或自动召回。不要在每次对话都写，只在有真正洞察时才写。',
    parameters: memoryDiaryParameters,

    async execute(toolCallId, input) {
      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'memory-diary');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

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
          const header = `# Agent Diary — ${date}\n\n> 这是 AI 助手的日志页；当前不会进入长期记忆检索或自动召回。\n`;
          await fs.writeFile(diaryFile, header + entryBlock, 'utf-8');
        } else {
          await fs.appendFile(diaryFile, entryBlock, 'utf-8');
        }

        return createJsonToolResult({
          success: true,
          surface: 'log-only',
          indexed: false,
          searchable: false,
          recallable: false,
          date,
          file: `memory/diary/${date}.md`,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
          message: '日志已记录（不会进入长期记忆检索）'
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
