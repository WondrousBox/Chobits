import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const diaryState = vi.hoisted(() => ({
  rootPath: ''
}));

vi.mock('@packages/common/db', () => ({
  WorkspacesRepo: {
    getById: vi.fn(async () => (diaryState.rootPath ? { id: 'ws-1', rootPath: diaryState.rootPath } : null)),
    getDefault: vi.fn(async () => (diaryState.rootPath ? { id: 'ws-1', rootPath: diaryState.rootPath } : null))
  }
}));

vi.mock('../packages/ai/services/memory-date', () => ({
  getTodayMemoryDate: () => '2026-04-12'
}));

import { DEFAULT_SESSION_TOOL_IDS, getPiToolDescriptor } from '../packages/ai/runtime/pi/tool-registry';
import { createPiMemoryDiaryTool } from '../packages/ai/runtime/pi/tools/memory-diary';

afterEach(async () => {
  if (diaryState.rootPath) {
    await fs.rm(diaryState.rootPath, { recursive: true, force: true });
    diaryState.rootPath = '';
  }
});

function createToolContext(): any {
  return {
    resolved: {
      request: {
        extras: {
          workspaceId: 'ws-1'
        }
      }
    }
  };
}

function getToolDetails(result: any): any {
  return result?.details;
}

describe('memory diary tool', () => {
  it('keeps diary outside the default searchable memory surface', () => {
    expect(DEFAULT_SESSION_TOOL_IDS).not.toContain('memory-diary');

    const descriptor = getPiToolDescriptor('memory-diary');
    expect(descriptor?.description).toContain('不会进入长期记忆检索');
  });

  it('writes a log-only diary file and returns explicit non-retrievable flags', async () => {
    diaryState.rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'chobits-memory-diary-'));

    const tool = createPiMemoryDiaryTool(createToolContext());
    const result = getToolDetails(
      await tool.execute('call-1', {
        entry: '第一次洞察：这个条目应该只进入日志面，不进入长期记忆检索。',
        tags: ['调试技巧', '用户偏好']
      })
    );

    expect(result).toMatchObject({
      success: true,
      surface: 'log-only',
      indexed: false,
      searchable: false,
      recallable: false,
      date: '2026-04-12',
      file: 'memory/diary/2026-04-12.md'
    });
    expect(result.message).toContain('不会进入长期记忆检索');

    const diaryFile = path.join(diaryState.rootPath, 'memory', 'diary', '2026-04-12.md');
    const content = await fs.readFile(diaryFile, 'utf-8');

    expect(content).toContain('# Agent Diary — 2026-04-12');
    expect(content).toContain('这是 AI 助手的日志页；当前不会进入长期记忆检索或自动召回。');
    expect(content).toContain('第一次洞察：这个条目应该只进入日志面，不进入长期记忆检索。');
    expect(content).toContain('[调试技巧, 用户偏好]');
  });
});
