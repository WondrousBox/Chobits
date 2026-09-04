/**
 * Toolbox — 渐进式工具技能加载系统
 *
 * 从 toolbox.md 内容解析工具技能章节，构建轻量索引。
 * Agent 通过 toolboxLookupTool 按需加载相关技能的详细使用说明。
 *
 * 内容通过 Vite raw import 从 toolbox.md 加载，编辑 md 文件即可生效。
 */

// ━━ Types ━━

export interface ToolboxSkillEntry {
  /** 章节标题（去掉 ## 前缀） */
  name: string;
  /** 触发词列表（从 **触发词：** 行解析） */
  triggers: string[];
  /** 涉及工具列表（从 **涉及工具：** 行解析） */
  tools: string[];
  /** 章节完整内容（包含标题以下所有文本） */
  content: string;
  /** 在源内容中的行号范围 */
  lineStart: number;
  lineEnd: number;
}

export interface ToolboxIndex {
  /** 所有技能条目 */
  skills: ToolboxSkillEntry[];
  /** 技能概览（名称 + 触发词摘要），用于注入 system prompt */
  catalog: string;
}

// ━━ Content (loaded from toolbox.md via Vite raw import) ━━

import TOOLBOX_CONTENT from './toolbox.md?raw';

// ━━ Parser ━━

function parseTriggersLine(line: string): string[] {
  // "**触发词：** 搜索网页、找资料" → ["搜索网页", "找资料"]
  const match = line.match(/\*\*触发词[：:]\*\*\s*(.+)/);
  if (!match) return [];
  return match[1]
    .split(/[、,，;；]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function parseToolsLine(line: string): string[] {
  // "**涉及工具：** webSearchTool, webReadTool" → ["webSearchTool", "webReadTool"]
  const match = line.match(/\*\*涉及工具[：:]\*\*\s*(.+)/);
  if (!match) return [];
  return match[1]
    .split(/[、,，;；]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function parseToolboxMarkdown(markdown: string): ToolboxSkillEntry[] {
  const lines = markdown.split('\n');
  const skills: ToolboxSkillEntry[] = [];
  let current: { name: string; lineStart: number; contentLines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^##\s+(.+)$/);

    if (headingMatch) {
      // 结束上一个章节
      if (current) {
        skills.push(buildEntry(current, i - 1));
      }
      current = { name: headingMatch[1].trim(), lineStart: i + 1, contentLines: [] };
    } else if (current) {
      current.contentLines.push(line);
    }
  }

  // 最后一个章节
  if (current) {
    skills.push(buildEntry(current, lines.length));
  }

  return skills;
}

function buildEntry(raw: { name: string; lineStart: number; contentLines: string[] }, lineEnd: number): ToolboxSkillEntry {
  const content = raw.contentLines.join('\n').trim();
  let triggers: string[] = [];
  let tools: string[] = [];

  for (const line of raw.contentLines) {
    if (!triggers.length) {
      const t = parseTriggersLine(line);
      if (t.length) triggers = t;
    }
    if (!tools.length) {
      const t = parseToolsLine(line);
      if (t.length) tools = t;
    }
    if (triggers.length && tools.length) break;
  }

  return {
    name: raw.name,
    triggers,
    tools,
    content,
    lineStart: raw.lineStart,
    lineEnd
  };
}

// ━━ Index ━━

let cachedIndex: ToolboxIndex | null = null;

export function loadToolboxIndex(): ToolboxIndex {
  if (cachedIndex) return cachedIndex;

  const skills = parseToolboxMarkdown(TOOLBOX_CONTENT);

  const catalogLines = skills.map((s) => {
    const triggerHint = s.triggers.length > 0 ? `（${s.triggers.slice(0, 4).join('、')}）` : '';
    return `- **${s.name}**${triggerHint}`;
  });

  cachedIndex = {
    skills,
    catalog: catalogLines.join('\n')
  };
  return cachedIndex;
}

// ━━ Multilingual Search Helpers ━━

/** Bidirectional synonym table for cross-language matching */
const SYNONYM_TABLE: Record<string, string[]> = {
  下载: ['download'],
  download: ['下载'],
  查找: ['search', 'find', 'query', '查询', '搜索'],
  查询: ['search', 'find', 'query', '查找', '搜索'],
  搜索: ['search', 'find', '查找', '查询'],
  创建: ['create'],
  create: ['创建'],
  保存: ['save', 'create'],
  save: ['保存'],
  search: ['查找', '查询', '搜索'],
  find: ['查找', '查询']
};

/**
 * Tokenize a mixed CJK+Latin query into meaningful search terms.
 *
 * "下载模型"      → ["下载", "模型"]     (known CJK compounds)
 * "push card" → ["push", "card"]
 * "下载plugin"  → ["下载", "plugin"]
 */
function tokenizeQuery(text: string): string[] {
  const result: string[] = [];
  // Split by whitespace and common delimiters first
  const parts = text.split(/[\s,，、;；:：]+/).filter(Boolean);
  for (const part of parts) {
    // Split CJK runs from Latin runs within the same token
    const segments = part.match(/[\u4e00-\u9fff\u3400-\u4dbf]+|[a-zA-Z0-9_-]+/g);
    if (segments) {
      for (const seg of segments) {
        if (/[\u4e00-\u9fff]/.test(seg)) {
          // For CJK: try to match known synonyms as whole tokens first,
          // then fall back to bigrams for unknown compounds
          const cjkTokens = splitCJKByKnownTerms(seg);
          result.push(...cjkTokens);
        } else {
          result.push(seg);
        }
      }
    }
  }
  return result.filter((t) => t.length > 0).map((t) => t.toLowerCase());
}

/**
 * Split a CJK string by matching known synonym/trigger terms first,
 * then emit remaining characters as individual tokens.
 *
 * "下载模型" → ["下载", "模型"] ("下载" is a known term)
 * "看看模型" → ["看看", "模型"] (bigram fallback for "看看")
 */
function splitCJKByKnownTerms(text: string): string[] {
  const knownTerms = Object.keys(SYNONYM_TABLE).filter((k) => /[\u4e00-\u9fff]/.test(k));
  // Sort by length desc for greedy matching
  knownTerms.sort((a, b) => b.length - a.length);

  const tokens: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let matched = false;
    for (const term of knownTerms) {
      if (remaining.startsWith(term)) {
        tokens.push(term);
        remaining = remaining.slice(term.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Emit bigrams for unknown CJK segments, or single char if only 1 left
      if (remaining.length >= 2) {
        tokens.push(remaining.slice(0, 2));
        remaining = remaining.slice(1); // sliding window
      } else {
        tokens.push(remaining);
        remaining = '';
      }
    }
  }
  return tokens;
}

/** Expand tokens with synonyms for cross-language matching */
function expandWithSynonyms(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    const syns = SYNONYM_TABLE[token];
    if (syns) {
      for (const syn of syns) {
        expanded.add(syn.toLowerCase());
      }
    }
  }
  return Array.from(expanded);
}

/**
 * Parse camelCase tool names into searchable parts.
 * "webSearchTool" → ["web", "search", "tool"]
 */
function parseToolNameParts(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean);
}

// ━━ Search ━━

/**
 * 根据查询匹配相关技能。
 *
 * 多层打分策略（灵感来自 Claude Code 的 ToolSearchTool）：
 * 1. 触发词精确匹配（最高权重）
 * 2. 技能名称匹配
 * 3. Token 级匹配（含同义词跨语言扩展）
 * 4. 工具名 camelCase 拆分匹配
 * 5. 内容关键词匹配（最低权重）
 */
export function searchToolbox(query: string, maxResults = 3): ToolboxSkillEntry[] {
  const index = loadToolboxIndex();
  if (!index.skills.length) return [];

  const queryLower = query.toLowerCase().trim();
  const tokens = tokenizeQuery(query);
  const expandedTokens = expandWithSynonyms(tokens);
  const originalSet = new Set(tokens);

  const scored = index.skills.map((skill) => {
    let score = 0;
    const nameLower = skill.name.toLowerCase();

    // ━━ 1. Trigger-level matching (highest weight) ━━
    for (const trigger of skill.triggers) {
      const tLower = trigger.toLowerCase();
      if (queryLower === tLower) {
        score += 15; // exact full match
      } else if (queryLower.includes(tLower)) {
        score += 10; // query contains full trigger
      } else if (tLower.includes(queryLower)) {
        score += 7; // trigger contains full query
      }
    }

    // ━━ 2. Skill name matching ━━
    if (queryLower === nameLower) {
      score += 12;
    } else if (queryLower.includes(nameLower) || nameLower.includes(queryLower)) {
      score += 8;
    }

    // ━━ 3. Token-level matching with synonym expansion ━━
    for (const token of expandedTokens) {
      const isSynonym = !originalSet.has(token);
      const weight = isSynonym ? 0.6 : 1; // synonyms get reduced weight

      // vs triggers
      for (const trigger of skill.triggers) {
        const tLower = trigger.toLowerCase();
        if (tLower === token) {
          score += 6 * weight;
        } else if (tLower.includes(token)) {
          score += 3 * weight;
        }
      }

      // vs skill name tokens
      const nameTokens = tokenizeQuery(skill.name);
      for (const nt of nameTokens) {
        if (nt === token) {
          score += 5 * weight;
        } else if (nt.includes(token) || token.includes(nt)) {
          score += 2 * weight;
        }
      }

      // vs tool name parts (camelCase split)
      for (const tool of skill.tools) {
        const parts = parseToolNameParts(tool);
        for (const part of parts) {
          if (part === token) {
            score += 4 * weight;
          } else if (part.includes(token) || token.includes(part)) {
            score += 2 * weight;
          }
        }
      }

      // vs content keywords (lowest weight)
      if (skill.content.toLowerCase().includes(token)) {
        score += 1 * weight;
      }
    }

    return { skill, score };
  });

  const exactMatches = scored.filter(({ skill }) => {
    const nameLower = skill.name.toLowerCase();
    return queryLower === nameLower || skill.triggers.some((trigger) => queryLower === trigger.toLowerCase());
  });
  if (exactMatches.length) {
    return exactMatches
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((s) => s.skill);
  }

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((s) => s.skill);
}

/** 列出所有技能名称（供 agent 浏览） */
export function listToolboxSkills(): Array<{ name: string; triggers: string[]; tools: string[] }> {
  const index = loadToolboxIndex();
  return index.skills.map((s) => ({
    name: s.name,
    triggers: s.triggers,
    tools: s.tools
  }));
}

/** 按名称精确获取技能详情 */
export function getToolboxSkill(name: string): ToolboxSkillEntry | undefined {
  const index = loadToolboxIndex();
  return index.skills.find((s) => s.name === name || s.name.toLowerCase() === name.toLowerCase());
}
