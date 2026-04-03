/**
 * User Persona Update Service — 执行画像更新/创建
 *
 * 职责：
 * 1. 读取现有画像
 * 2. 构造更新/创建 Prompt 调用 LLM
 * 3. 校验 LLM 输出
 * 4. 原子写入（tmp → validate → rename → backup）
 *
 * @see docs/memory-system/user-persona-profile-design.md §6
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { createDefaultFrontmatter, parsePersonaMarkdown, renderPersonaMarkdown, validateBody } from './persona-document';
import {
  PERSONA_CHAR_BUDGET,
  PERSONA_FILENAME,
  PERSONA_ITEM_BUDGET,
  PERSONA_MAX_BACKUPS,
  type PersonaCandidateFact,
  type PersonaChatFn,
  type PersonaUpdateJobParams,
  type PersonaUpdateResult
} from './persona-types';

// ━━ Prompt ━━

const UPDATE_PROMPT = `你是用户画像精炼器。你的任务是将新证据融入现有画像，产出一份更精炼的版本。

输入：
1) 现有画像 Markdown（可能为空——如果是首次创建）
2) 新增候选事实列表（含 dimension、statement、confidence）
3) 证据摘要（简要对话片段）

输出规则：
- 输出完整的 User Persona Markdown（含所有 section）
- 只允许 8 个 section：Snapshot, Basic Info, Preferences & Taste, Goals & Motivation, Personality & Communication, Decision Style & Boundaries, Current Activities, Recent Shift
- 每条信息必须是结论句（不写过程叙述）
- 总条目数 <= ${PERSONA_ITEM_BUDGET} 条，总正文 <= ${PERSONA_CHAR_BUDGET} 字符
- 与现有画像冲突的条目用新证据替换旧值
- 重复条目合并为更精炼的表达
- 低置信（confidence < 0.5）仅放入 Recent Shift
- 无变化的条目原样保留
- Snapshot 必须是一句话（<= 60 字），概括用户画像核心
- Current Activities 记录用户近期正在做的事、当前项目和关注点（最多 4 条），这些信息时效性强，新的活动应替换旧的
- Recent Shift 记录近期态度/偏好转变（最多 2 条）
- 禁止写入助手的偏好或系统策略
- 无内容的 section 省略（Snapshot 除外）

输出格式：直接输出 Markdown 正文（不含 frontmatter，以 # User Persona 开头），不要解释。`;

// ━━ 核心函数 ━━

/**
 * 执行画像更新。
 * 如果文件不存在则进入创建模式。
 */
export async function updatePersona(params: PersonaUpdateJobParams, chatFn: PersonaChatFn, workspaceRoot: string, signal?: AbortSignal): Promise<PersonaUpdateResult> {
  const TAG = '[PersonaUpdate]';
  const personaDir = path.join(workspaceRoot, 'memory');
  const personaPath = path.join(personaDir, PERSONA_FILENAME);

  // 确保目录存在
  await fs.mkdir(personaDir, { recursive: true });

  // 读取现有画像
  let existingContent: string | null = null;
  try {
    existingContent = await fs.readFile(personaPath, 'utf-8');
    console.log(`${TAG} Read existing persona: ${existingContent.length} chars`);
  } catch {
    console.log(`${TAG} No existing persona file, entering create mode`);
  }

  const isCreate = !existingContent;

  // 构造 prompt
  const prompt = buildUpdatePrompt(existingContent, params.candidateFacts, params.evidence);
  console.log(`${TAG} Sending update prompt to LLM (${prompt.length} chars)...`);

  const response = await chatFn(prompt, signal);
  console.log(`${TAG} LLM response: ${response.length} chars`);

  // 校验 LLM 输出
  const bodyContent = response.trim();
  const validation = validateBody(bodyContent);

  if (!validation.valid) {
    console.warn(`${TAG} LLM output failed validation: ${validation.errors.join('; ')}`);
    // 尝试让 LLM 压缩
    const compressed = await compressIfNeeded(bodyContent, chatFn, signal);
    const revalidation = validateBody(compressed);
    if (!revalidation.valid) {
      throw new Error(`Persona update failed validation after compression: ${revalidation.errors.join('; ')}`);
    }
    return await atomicWrite(personaPath, personaDir, compressed, existingContent, params, isCreate);
  }

  return await atomicWrite(personaPath, personaDir, bodyContent, existingContent, params, isCreate);
}

// ━━ 内部辅助 ━━

function buildUpdatePrompt(existingPersona: string | null, candidateFacts: PersonaCandidateFact[], evidence: PersonaUpdateJobParams['evidence']): string {
  const personaSection = existingPersona?.trim() ? `现有画像：\n${existingPersona}` : '现有画像：（空，首次创建）';

  const factsSection = candidateFacts.map((f) => `- [${f.dimension}] (confidence=${f.confidence}) ${f.statement}`).join('\n');

  const evidenceSection = evidence.map((e) => `- conv:${e.conversationId} seq:${e.seqStart}~${e.seqEnd}`).join('\n');

  return `${UPDATE_PROMPT}\n\n---\n\n${personaSection}\n\n---\n\n新增候选事实：\n${factsSection}\n\n---\n\n证据摘要：\n${evidenceSection}`;
}

async function compressIfNeeded(body: string, chatFn: PersonaChatFn, signal?: AbortSignal): Promise<string> {
  const TAG = '[PersonaUpdate:compress]';
  const compressPrompt = `以下用户画像超出了预算限制。请精炼压缩，使总正文 <= ${PERSONA_CHAR_BUDGET} 字符、总条目 <= ${PERSONA_ITEM_BUDGET} 条。保留高价值信息，删除低价值条目，合并同义条目。直接输出 Markdown，不要解释。\n\n${body}`;

  console.log(`${TAG} Requesting compression...`);
  const compressed = await chatFn(compressPrompt, signal);
  console.log(`${TAG} Compressed result: ${compressed.length} chars`);
  return compressed.trim();
}

async function atomicWrite(
  personaPath: string,
  personaDir: string,
  bodyContent: string,
  existingContent: string | null,
  params: PersonaUpdateJobParams,
  isCreate: boolean
): Promise<PersonaUpdateResult> {
  const TAG = '[PersonaUpdate:write]';

  // 解析现有 frontmatter 或创建默认
  let frontmatter = createDefaultFrontmatter(params.workspaceId);
  if (existingContent) {
    const parsed = parsePersonaMarkdown(existingContent);
    frontmatter = {
      ...parsed.frontmatter,
      version: parsed.frontmatter.version + 1,
      updatedAt: Date.now(),
      compressionRound: parsed.frontmatter.compressionRound + 1
    };
  } else {
    frontmatter.updatedAt = Date.now();
  }

  const fullContent = renderPersonaMarkdown(frontmatter, bodyContent);

  // 写入临时文件
  const tmpPath = personaPath + '.tmp';
  await fs.writeFile(tmpPath, fullContent, 'utf-8');
  console.log(`${TAG} Wrote tmp file: ${tmpPath} (${fullContent.length} chars)`);

  // 备份旧版本
  if (existingContent) {
    await backupOldVersion(personaPath, personaDir, frontmatter.version - 1);
  }

  // 原子替换
  await fs.rename(tmpPath, personaPath);
  console.log(`${TAG} Atomic rename: ${tmpPath} → ${personaPath}`);

  // 解析结果统计
  const result = parsePersonaMarkdown(fullContent);

  return {
    action: isCreate ? 'created' : 'updated',
    charCount: fullContent.length,
    itemCount: result.facts.length + (result.snapshot ? 1 : 0),
    compressionRound: frontmatter.compressionRound,
    filePath: personaPath
  };
}

async function backupOldVersion(personaPath: string, personaDir: string, oldVersion: number): Promise<void> {
  const TAG = '[PersonaUpdate:backup]';
  try {
    const backupName = `USER_PERSONA.v${oldVersion}.bak.md`;
    const backupPath = path.join(personaDir, backupName);
    await fs.copyFile(personaPath, backupPath);
    console.log(`${TAG} Backed up v${oldVersion}: ${backupPath}`);

    // 清理超出限制的旧备份
    const files = await fs.readdir(personaDir);
    const backups = files
      .filter((f) => f.match(/^USER_PERSONA\.v\d+\.bak\.md$/))
      .sort((a, b) => {
        const aVer = Number(a.match(/v(\d+)/)?.[1] || 0);
        const bVer = Number(b.match(/v(\d+)/)?.[1] || 0);
        return bVer - aVer; // 从新到旧
      });

    if (backups.length > PERSONA_MAX_BACKUPS) {
      for (const old of backups.slice(PERSONA_MAX_BACKUPS)) {
        await fs.unlink(path.join(personaDir, old));
        console.log(`${TAG} Removed old backup: ${old}`);
      }
    }
  } catch (e) {
    console.warn(`${TAG} Backup failed (non-fatal):`, e);
  }
}
