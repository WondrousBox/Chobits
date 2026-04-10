/**
 * User Profile IPC Handlers
 * 注册 user-profile:* IPC channels
 *
 * @see docs/memory-system/user-persona-profile-design.md §9
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ipcMain } from 'electron';

import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { checkPersonaUpdateNeeded, formatConversationSnippet } from '../../../../packages/ai/services/persona-check-service';
import { extractSnapshot, extractTopFacts, parsePersonaMarkdown } from '../../../../packages/ai/services/persona-document';
import { PERSONA_FILENAME, type PersonaChatFn, type PersonaCheckParams, type PersonaDocumentSummary, type PersonaUpdateJobParams } from '../../../../packages/ai/services/persona-types';
import { createManagedTaskChatFn, LONG_TASK_CHAT_TIMEOUTS } from '../../../../packages/ai/services/task-chat-runner';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { personaUpdateQueue } from './persona-queue';
import { initPersonaTrigger } from './persona-trigger';
import { initUserProfileEnricher } from './user-profile-enricher';

function adaptChatFn(piChatFn: PiTaskChatFunction): PersonaChatFn {
  return createManagedTaskChatFn(piChatFn, {
    tag: '[UserProfileTaskChat]',
    timeouts: LONG_TASK_CHAT_TIMEOUTS
  });
}

export function initUserProfileHandlers(): void {
  // ━━ 读取画像 ━━
  ipcMain.handle('user-profile:get', async (_event, params: { workspaceId: string; includeFull?: boolean }) => {
    const ws = await WorkspacesRepo.getById(params.workspaceId);
    if (!ws?.rootPath) return { exists: false, workspaceId: params.workspaceId } as PersonaDocumentSummary;

    const personaPath = path.join(ws.rootPath, 'memory', PERSONA_FILENAME);
    try {
      const content = await fs.readFile(personaPath, 'utf-8');
      const parsed = parsePersonaMarkdown(content);
      const summary: PersonaDocumentSummary = {
        workspaceId: params.workspaceId,
        exists: true,
        updatedAt: parsed.frontmatter.updatedAt,
        charCount: content.length,
        itemCount: parsed.facts.length + (parsed.snapshot ? 1 : 0),
        compressionRound: parsed.frontmatter.compressionRound,
        snapshot: extractSnapshot(parsed)
      };
      if (params.includeFull) {
        summary.fullMarkdown = content;
      }
      return summary;
    } catch {
      return {
        exists: false,
        workspaceId: params.workspaceId,
        updatedAt: 0,
        charCount: 0,
        itemCount: 0,
        compressionRound: 0,
        snapshot: ''
      } as PersonaDocumentSummary;
    }
  });

  // ━━ 手动判定 ━━
  ipcMain.handle('user-profile:checkUpdateNeeded', async (_event, params: PersonaCheckParams) => {
    const ws = await WorkspacesRepo.getById(params.workspaceId);
    if (!ws?.rootPath) throw new Error(`Workspace ${params.workspaceId} not found`);

    let currentPersona: string | null = null;
    try {
      currentPersona = await fs.readFile(path.join(ws.rootPath, 'memory', PERSONA_FILENAME), 'utf-8');
    } catch {
      // 文件不存在
    }

    const messages = await ChatRepo.listMessages(params.conversationId, 200, 0);
    const allMessages = messages.filter((m: any) => m.role === 'user' || m.role === 'assistant').map((m: any) => ({ role: m.role, content: m.content, seq: m.seq ?? 0 }));
    const snippet = formatConversationSnippet(allMessages, params.conversationId);

    const providerId = params.providerId;
    if (!providerId) throw new Error('providerId is required');

    const runtime = await createPiTaskChatRuntimeFromRequest({
      providerId,
      providerPresetId: params.providerPresetId,
      agentId: 'user-persona-check',
      maxTokens: 1000
    });
    const chatFn = adaptChatFn(runtime.chatFn);

    return checkPersonaUpdateNeeded({ conversationId: params.conversationId, workspaceId: params.workspaceId, currentPersona, conversationSnippet: snippet }, chatFn);
  });

  // ━━ 手动入队 ━━
  ipcMain.handle('user-profile:enqueueUpdate', async (_event, params: PersonaUpdateJobParams) => {
    const jobId = await personaUpdateQueue.enqueue(params);
    return { jobId };
  });

  // ━━ 查询状态 ━━
  ipcMain.handle('user-profile:getUpdateStatus', async () => {
    return personaUpdateQueue.getStatus();
  });

  // ━━ 获取注入文本 ━━
  ipcMain.handle('user-profile:getInjectionText', async (_event, params: { workspaceId: string; level?: 'snapshot' | 'top' | 'full' }) => {
    const ws = await WorkspacesRepo.getById(params.workspaceId);
    if (!ws?.rootPath) return null;

    try {
      const content = await fs.readFile(path.join(ws.rootPath, 'memory', PERSONA_FILENAME), 'utf-8');
      const parsed = parsePersonaMarkdown(content);
      const level = params.level || 'top';

      if (level === 'snapshot') {
        return parsed.snapshot || null;
      }
      if (level === 'full') {
        return content;
      }

      // 默认 top: snapshot + top facts
      const snapshot = extractSnapshot(parsed);
      const facts = extractTopFacts(parsed);
      if (!snapshot && facts.length === 0) return null;

      const lines = [];
      if (snapshot) lines.push(`- ${snapshot}`);
      lines.push(...facts);
      return lines.join('\n');
    } catch {
      return null;
    }
  });

  // 初始化事件触发器
  initPersonaTrigger();

  // 注册系统提示词 enricher
  initUserProfileEnricher();

  console.log('[UserProfile] IPC handlers registered');
}
