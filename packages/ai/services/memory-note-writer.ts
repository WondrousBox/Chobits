/**
 * Memory Note Writer
 * 将 MergedNote 渲染为 Markdown 文件内容（YAML frontmatter + 结构化正文）。
 */

import type { MemoryNoteFrontmatter, MergedNote } from './memory-types';

/**
 * 渲染完整的 Memory Note Markdown 内容
 */
export function renderNoteMarkdown(note: MergedNote): string {
  const parts: string[] = [];

  // YAML Frontmatter
  parts.push('---');
  parts.push(renderFrontmatter(note.frontmatter));
  parts.push('---');
  parts.push('');

  // 固定的段落顺序
  const sectionOrder = ['Key Points', 'Open Items'];

  for (const heading of sectionOrder) {
    const content = note.sections.get(heading);
    if (content && content.trim()) {
      parts.push(`## ${heading}`);
      parts.push('');
      parts.push(content.trim());
      parts.push('');
    }
  }

  // 其余自定义段落（非标准段落名）
  for (const [heading, content] of note.sections) {
    if (!sectionOrder.includes(heading) && content && content.trim()) {
      parts.push(`## ${heading}`);
      parts.push('');
      parts.push(content.trim());
      parts.push('');
    }
  }

  return parts.join('\n');
}

/**
 * 渲染 YAML frontmatter（不含 --- 分隔符）
 */
function renderFrontmatter(fm: MemoryNoteFrontmatter): string {
  const lines: string[] = [];

  // 身份
  lines.push(`id: '${fm.id}'`);
  lines.push(`version: ${fm.version}`);

  // 归属
  lines.push(`workspaceId: '${fm.workspaceId}'`);
  lines.push(`date: '${fm.date}'`);
  if (fm.timeRange) {
    lines.push('timeRange:');
    lines.push(`  start: ${fm.timeRange.start}`);
    lines.push(`  end: ${fm.timeRange.end}`);
  }

  // 主题
  lines.push('topics:');
  for (const t of fm.topics) {
    lines.push(`  - '${escapeYaml(t)}'`);
  }
  if (fm.parentTopicId) {
    lines.push(`parentTopicId: '${fm.parentTopicId}'`);
  }
  if (fm.relatedTopicIds?.length) {
    lines.push('relatedTopicIds:');
    for (const id of fm.relatedTopicIds) {
      lines.push(`  - '${id}'`);
    }
  }

  // 关键词
  lines.push('keywords:');
  for (const kw of fm.keywords) {
    lines.push(`  - '${escapeYaml(kw)}'`);
  }
  if (fm.aliases?.length) {
    lines.push('aliases:');
    for (const a of fm.aliases) {
      lines.push(`  - '${escapeYaml(a)}'`);
    }
  }
  if (fm.entities?.length) {
    lines.push('entities:');
    for (const e of fm.entities) {
      lines.push(`  - name: '${escapeYaml(e.name)}'`);
      lines.push(`    type: '${e.type}'`);
    }
  }

  // 摘要
  lines.push(`summary: >`);
  lines.push(`  ${fm.summary.replace(/\n/g, '\n  ')}`);

  // 溯源
  lines.push('sourceConversationIds:');
  for (const id of fm.sourceConversationIds) {
    lines.push(`  - '${id}'`);
  }
  if (fm.sourceMessageRange?.length) {
    lines.push('sourceMessageRange:');
    for (const r of fm.sourceMessageRange) {
      lines.push(`  - conversationId: '${r.conversationId}'`);
      lines.push(`    seqStart: ${r.seqStart}`);
      lines.push(`    seqEnd: ${r.seqEnd}`);
    }
  }

  // 权重
  lines.push(`importance: ${fm.importance}`);
  lines.push(`stability: ${fm.stability}`);

  // 生命周期
  lines.push(`createdAt: ${fm.createdAt}`);
  lines.push(`updatedAt: ${fm.updatedAt}`);

  return lines.join('\n');
}

/**
 * 从 MemoryExtractionOutput 的 sections 构建 Markdown 段落 Map
 */
export function buildSectionsMap(sections: {
  keyPoints: string;
  openItems?: string;
}): Map<string, string> {
  const map = new Map<string, string>();

  if (sections.keyPoints) {
    map.set('Key Points', sections.keyPoints);
  }
  if (sections.openItems) {
    map.set('Open Items', sections.openItems);
  }

  return map;
}

/**
 * 构建 memory note 文件路径（workspace-relative）
 * 格式：memory/daily/YYYY/MM/YYYY-MM-DD-topic-slug.md
 */
export function buildNotePath(date: string, topicSlug: string, suffix?: number): string {
  const [year, month] = date.split('-');
  const fileName = suffix ? `${date}-${topicSlug}-${suffix}.md` : `${date}-${topicSlug}.md`;
  return `memory/daily/${year}/${month}/${fileName}`;
}

/**
 * 生成 Memory Note ID
 * 格式：mem_{date}_{slug}_{short-hash}
 */
export function generateNoteId(date: string, topicSlug: string): string {
  const shortHash = Math.random().toString(16).slice(2, 8);
  return `mem_${date}_${topicSlug}_${shortHash}`;
}

// ━━ Helpers ━━

function escapeYaml(s: string): string {
  return s.replace(/'/g, "''");
}
