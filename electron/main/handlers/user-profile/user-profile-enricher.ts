/**
 * User Profile Enricher
 *
 * 将用户画像 (USER_PERSONA.md) 注册为 SystemPromptEnricher，
 * 在 buildPiContext() 阶段自动注入用户画像信息。
 *
 * 设计：
 * - 读取当前 workspace 下的 USER_PERSONA.md
 * - 解析后以 top 级别（snapshot + 核心 facts）注入系统提示词
 * - 不需要 LLM 调用，纯文件读取
 * - 带内存缓存（5 分钟），避免每轮对话都读磁盘
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { extractSnapshot, extractTopFacts, parsePersonaMarkdown } from '../../../../packages/ai/services/persona-document';
import { PERSONA_FILENAME } from '../../../../packages/ai/services/persona-types';
import { registerSystemPromptEnricher } from '../../../../packages/ai/system-prompt-enricher';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { WorkspacesRepo } from '../../db/repositories';

const TAG = '[UserProfile:Enricher]';

// ━━ Cache ━━

interface CachedProfile {
  workspaceId: string;
  text: string | null;
  cachedAt: number;
}

let cachedProfile: CachedProfile | undefined;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

/**
 * 读取并格式化用户画像注入文本。
 * 使用 top 级别: snapshot + top facts。
 */
async function getProfileText(workspaceId: string): Promise<string | null> {
  // 检查缓存
  if (cachedProfile && cachedProfile.workspaceId === workspaceId && Date.now() - cachedProfile.cachedAt < CACHE_TTL_MS) {
    return cachedProfile.text;
  }

  const ws = await WorkspacesRepo.getById(workspaceId);
  if (!ws?.rootPath) {
    cachedProfile = { workspaceId, text: null, cachedAt: Date.now() };
    return null;
  }

  try {
    const content = await fs.readFile(path.join(ws.rootPath, 'memory', PERSONA_FILENAME), 'utf-8');
    const parsed = parsePersonaMarkdown(content);

    const snapshot = extractSnapshot(parsed);
    const facts = extractTopFacts(parsed);

    if (!snapshot && facts.length === 0) {
      cachedProfile = { workspaceId, text: null, cachedAt: Date.now() };
      return null;
    }

    const lines: string[] = [];
    if (snapshot) lines.push(`- ${snapshot}`);
    lines.push(...facts);
    const text = lines.join('\n');

    cachedProfile = { workspaceId, text, cachedAt: Date.now() };
    return text;
  } catch {
    // 文件不存在
    cachedProfile = { workspaceId, text: null, cachedAt: Date.now() };
    return null;
  }
}

// ━━ Enricher Registration ━━

export function initUserProfileEnricher(): void {
  registerSystemPromptEnricher({
    id: 'user-profile',
    resolve: async (ctx) => {
      const { request } = ctx;

      // 非持久化对话（如标题生成）跳过
      if (request.persist === false) return null;

      // 内部 agent（记忆提取、画像更新等）跳过
      const skipAgents = new Set(['memory-extraction', 'title-generation', 'user-persona-check', 'user-persona-update', 'memory-auto-recall']);
      if (request.agentId && skipAgents.has(request.agentId)) return null;

      // 获取 workspaceId
      const workspaceId = request.extras?.workspaceId || (await WorkspacesRepo.getDefault())?.id;
      if (!workspaceId) return null;

      try {
        const profileText = await getProfileText(workspaceId);
        if (!profileText) return null;

        console.log(`${TAG} Injecting user profile: ${profileText.length} chars`);
        return formatUserProfileContext(profileText);
      } catch (e) {
        console.warn(`${TAG} Failed to load user profile (non-fatal):`, e instanceof Error ? e.message : e);
        return null;
      }
    }
  });

  console.log(`${TAG} Enricher registered`);

  // 画像更新后清除缓存
  eventManager.on(AppEvent.USER_PERSONA_UPDATE_COMPLETED, () => {
    clearUserProfileCache();
    console.log(`${TAG} Cache cleared after persona update`);
  });
}

/**
 * 将用户画像格式化为系统提示词段落。
 */
function formatUserProfileContext(profileText: string): string {
  return `<user_profile>
以下是关于当前用户的画像信息，请据此个性化你的回复：
- 自然地根据用户偏好调整沟通风格和内容
- 不要主动提及"根据您的画像"，除非用户主动询问
- 如果画像信息与当前对话上下文矛盾，以当前对话为准

${profileText}
</user_profile>`;
}

/**
 * 清除缓存（在画像更新后调用）。
 */
export function clearUserProfileCache(): void {
  cachedProfile = undefined;
}
