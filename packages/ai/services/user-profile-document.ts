/**
 * User Profile Document — 解析
 *
 * 负责：
 * - 将 USER_PROFILE.md 解析为结构化 ParsedUserProfile
 */

import {
  type ParsedUserProfile,
  USER_PROFILE_CHAR_BUDGET,
  USER_PROFILE_ITEM_BUDGET,
  USER_PROFILE_SECTIONS,
  type UserProfileDimension,
  type UserProfileFact,
  type UserProfileFrontmatter
} from './user-profile-types';

// ━━ 解析 ━━

const HEADING_TO_DIMENSION: Record<string, UserProfileDimension | 'snapshot'> = {};
for (const s of USER_PROFILE_SECTIONS) {
  HEADING_TO_DIMENSION[s.heading.toLowerCase()] = s.dimension;
}

/**
 * 解析 USER_PROFILE.md 内容为结构化数据。
 * 若文件格式不合法或为空串，返回带空数据的默认结构。
 */
export function parseUserProfileMarkdown(content: string): ParsedUserProfile {
  const rawMarkdown = content;

  // 解析 frontmatter
  const frontmatter = parseFrontmatter(content);
  const bodyContent = stripFrontmatter(content);

  // 解析 sections
  const sections = parseSections(bodyContent);
  let snapshot = '';
  const facts: UserProfileFact[] = [];

  for (const [heading, lines] of sections) {
    const dim = HEADING_TO_DIMENSION[heading.toLowerCase()];
    if (!dim) continue;

    const items = extractListItems(lines);

    if (dim === 'snapshot') {
      snapshot = items[0] || '';
      continue;
    }

    for (const statement of items) {
      facts.push({
        dimension: dim,
        statement,
        confidence: 0.8,
        stability: 0.7,
        recency: 0.5,
        evidenceCount: 1
      });
    }
  }

  return { frontmatter, snapshot, facts, rawMarkdown };
}

/**
 * 提取 Snapshot 段用于 system prompt 注入。
 */
export function extractSnapshot(parsed: ParsedUserProfile): string {
  return parsed.snapshot;
}

/**
 * 提取 Top Facts（排除 Recent Shift，但包含 Current Activities），按 dimension 顺序返回。
 */
export function extractTopFacts(parsed: ParsedUserProfile, maxCount: number = 10): string[] {
  return parsed.facts
    .filter((f) => f.dimension !== 'recent')
    .slice(0, maxCount)
    .map((f) => `- ${f.statement}`);
}

// ━━ 内部辅助 ━━

function parseFrontmatter(content: string): UserProfileFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {
      version: 0,
      workspaceId: '',
      updatedAt: 0,
      charBudget: USER_PROFILE_CHAR_BUDGET,
      itemBudget: USER_PROFILE_ITEM_BUDGET,
      compressionRound: 0
    };
  }

  const yaml = match[1];
  const result: Record<string, any> = {};

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value: string | number = line.slice(colonIdx + 1).trim();
    // 去除引号
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }
    // 数字转换
    if (/^\d+$/.test(String(value))) {
      value = Number(value);
    }
    result[key] = value;
  }

  return {
    version: Number(result.version) || 0,
    workspaceId: String(result.workspaceId || ''),
    updatedAt: Number(result.updatedAt) || 0,
    charBudget: Number(result.charBudget) || USER_PROFILE_CHAR_BUDGET,
    itemBudget: Number(result.itemBudget) || USER_PROFILE_ITEM_BUDGET,
    compressionRound: Number(result.compressionRound) || 0
  };
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return match ? match[1] : content;
}

/**
 * 把 markdown body 拆为 `Map<heading, linesContent>`。
 */
function parseSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = body.split('\n');
  let currentHeading = '';
  const currentLines: string[] = [];

  const flush = (): void => {
    if (currentHeading) {
      sections.set(currentHeading, currentLines.join('\n').trim());
      currentLines.length = 0;
    }
  };

  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      currentHeading = line.replace(/^##\s+/, '').trim();
    } else if (line.startsWith('# ') && !line.startsWith('## ')) {
      // 忽略 # User Profile 标题
      continue;
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * 从 section 文本中提取 `- xxx` 列表项。
 */
function extractListItems(sectionContent: string): string[] {
  return sectionContent
    .split('\n')
    .filter((l) => l.trimStart().startsWith('- '))
    .map((l) => l.replace(/^\s*-\s+/, '').trim())
    .filter(Boolean);
}
