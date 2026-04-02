/**
 * User Persona Document — 解析、渲染、校验
 *
 * 负责：
 * - 将 USER_PERSONA.md 解析为结构化 ParsedPersona
 * - 将 frontmatter + LLM 输出正文组合为完整 Markdown
 * - 校验预算、条目上限、结构合法性
 *
 * @see docs/memory-system/user-persona-profile-design.md §6.1, §7
 */

import {
  type ParsedPersona,
  PERSONA_CHAR_BUDGET,
  PERSONA_DIMENSION_LIMITS,
  PERSONA_ITEM_BUDGET,
  PERSONA_SECTIONS,
  PERSONA_SNAPSHOT_MAX_CHARS,
  type PersonaDimension,
  type PersonaFact,
  type PersonaFrontmatter,
  type PersonaValidationResult
} from './persona-types';

// ━━ 解析 ━━

const HEADING_TO_DIMENSION: Record<string, PersonaDimension | 'snapshot'> = {};
for (const s of PERSONA_SECTIONS) {
  HEADING_TO_DIMENSION[s.heading.toLowerCase()] = s.dimension;
}

/**
 * 解析 USER_PERSONA.md 内容为结构化数据。
 * 若文件格式不合法或为空串，返回带空数据的默认结构。
 */
export function parsePersonaMarkdown(content: string): ParsedPersona {
  const rawMarkdown = content;

  // 解析 frontmatter
  const frontmatter = parseFrontmatter(content);
  const bodyContent = stripFrontmatter(content);

  // 解析 sections
  const sections = parseSections(bodyContent);
  let snapshot = '';
  const facts: PersonaFact[] = [];

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
 * 将 frontmatter + body markdown 组合为完整文件内容。
 */
export function renderPersonaMarkdown(frontmatter: PersonaFrontmatter, body: string): string {
  const fm = renderFrontmatter(frontmatter);
  return `${fm}\n${body.trim()}\n`;
}

/**
 * 构造默认 frontmatter。
 */
export function createDefaultFrontmatter(workspaceId: string): PersonaFrontmatter {
  return {
    version: 1,
    workspaceId,
    updatedAt: Date.now(),
    charBudget: PERSONA_CHAR_BUDGET,
    itemBudget: PERSONA_ITEM_BUDGET,
    compressionRound: 0
  };
}

/**
 * 提取 Snapshot 段用于 system prompt 注入。
 */
export function extractSnapshot(parsed: ParsedPersona): string {
  return parsed.snapshot;
}

/**
 * 提取 Top Facts（排除 Recent Shift），按 dimension 顺序返回。
 */
export function extractTopFacts(parsed: ParsedPersona, maxCount: number = 8): string[] {
  return parsed.facts
    .filter((f) => f.dimension !== 'recent')
    .slice(0, maxCount)
    .map((f) => `- ${f.statement}`);
}

// ━━ 校验 ━━

/**
 * 校验 ParsedPersona 是否满足预算和质量门槛。
 * @see docs/memory-system/user-persona-profile-design.md §7
 */
export function validatePersona(parsed: ParsedPersona): PersonaValidationResult {
  const errors: string[] = [];

  // 计算正文字符数（不含 frontmatter）
  const body = stripFrontmatter(parsed.rawMarkdown);
  const charCount = body.trim().length;
  const itemCount = parsed.facts.length + (parsed.snapshot ? 1 : 0);

  // 字符预算
  if (charCount > PERSONA_CHAR_BUDGET) {
    errors.push(`字符数 ${charCount} 超出预算 ${PERSONA_CHAR_BUDGET}`);
  }

  // 条目预算
  if (itemCount > PERSONA_ITEM_BUDGET) {
    errors.push(`条目数 ${itemCount} 超出预算 ${PERSONA_ITEM_BUDGET}`);
  }

  // Snapshot 必须存在
  if (!parsed.snapshot) {
    errors.push('Snapshot 段不存在或为空');
  } else if (parsed.snapshot.length > PERSONA_SNAPSHOT_MAX_CHARS) {
    errors.push(`Snapshot 长度 ${parsed.snapshot.length} 超出 ${PERSONA_SNAPSHOT_MAX_CHARS} 字`);
  }

  // 每个维度条目上限
  const dimCounts: Partial<Record<PersonaDimension, number>> = {};
  for (const fact of parsed.facts) {
    dimCounts[fact.dimension] = (dimCounts[fact.dimension] || 0) + 1;
  }
  for (const [dim, count] of Object.entries(dimCounts)) {
    const limit = PERSONA_DIMENSION_LIMITS[dim as PersonaDimension];
    if (limit && count > limit) {
      errors.push(`维度 ${dim} 条目数 ${count} 超出上限 ${limit}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    charCount,
    itemCount
  };
}

/**
 * 对 LLM 输出的 body 做快速预算检查（写入前校验）。
 */
export function validateBody(body: string): PersonaValidationResult {
  const charCount = body.trim().length;
  const items = body.split('\n').filter((l) => l.trimStart().startsWith('- ')).length;
  const errors: string[] = [];

  if (charCount > PERSONA_CHAR_BUDGET) {
    errors.push(`字符数 ${charCount} 超出预算 ${PERSONA_CHAR_BUDGET}`);
  }
  if (items > PERSONA_ITEM_BUDGET) {
    errors.push(`条目数 ${items} 超出预算 ${PERSONA_ITEM_BUDGET}`);
  }

  return { valid: errors.length === 0, errors, charCount, itemCount: items };
}

// ━━ 内部辅助 ━━

function parseFrontmatter(content: string): PersonaFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {
      version: 0,
      workspaceId: '',
      updatedAt: 0,
      charBudget: PERSONA_CHAR_BUDGET,
      itemBudget: PERSONA_ITEM_BUDGET,
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
    charBudget: Number(result.charBudget) || PERSONA_CHAR_BUDGET,
    itemBudget: Number(result.itemBudget) || PERSONA_ITEM_BUDGET,
    compressionRound: Number(result.compressionRound) || 0
  };
}

function renderFrontmatter(fm: PersonaFrontmatter): string {
  return [
    '---',
    `version: ${fm.version}`,
    `workspaceId: '${fm.workspaceId}'`,
    `updatedAt: ${fm.updatedAt}`,
    `charBudget: ${fm.charBudget}`,
    `itemBudget: ${fm.itemBudget}`,
    `compressionRound: ${fm.compressionRound}`,
    '---'
  ].join('\n');
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
      // 忽略 # User Persona 标题
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
