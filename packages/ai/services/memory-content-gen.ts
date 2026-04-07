/**
 * Memory Content Generation Service
 *
 * 生成记忆系统的辅助内容文件：
 * 1. Daily Index (YYYY-MM-DD.index.md) — 当天所有记忆 note 的概览
 * 2. Topic Archive (topics/topic-slug.md) — 主题长期汇总
 * 3. MEMORY.md — 全局记忆索引
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface ContentGenDbDeps {
  listNotesByDate: (
    date: string,
    workspaceId?: string
  ) => Promise<
    Array<{
      id: string;
      date: string;
      filePath: string;
      topics: string;
      summary: string;
      importance: number;
      keywords: string;
    }>
  >;
  listNotesByWorkspace: (
    workspaceId: string,
    limit?: number,
    offset?: number
  ) => Promise<
    Array<{
      id: string;
      date: string;
      filePath: string;
      topics: string;
      summary: string;
      importance: number;
    }>
  >;
  listAllTopics: (
    workspaceId?: string,
    limit?: number
  ) => Promise<
    Array<{
      id: string;
      label: string;
      slug: string;
      heat: number | null;
      noteCount: number | null;
      description?: string | null;
    }>
  >;
  listNotesByTopicId: (
    topicId: string,
    workspaceId?: string,
    limit?: number
  ) => Promise<
    Array<{
      id: string;
      date: string;
      filePath: string;
      summary: string;
      importance: number;
    }>
  >;
}

// ━━ Daily Index ━━

export async function generateDailyIndex(date: string, workspaceRoot: string, db: ContentGenDbDeps, workspaceId?: string): Promise<{ filePath: string; noteCount: number }> {
  const notes = await db.listNotesByDate(date, workspaceId);
  if (notes.length === 0) {
    return { filePath: '', noteCount: 0 };
  }

  const [year, month] = date.split('-');
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`date: '${date}'`);
  if (workspaceId) lines.push(`workspaceId: '${workspaceId}'`);
  lines.push(`noteCount: ${notes.length}`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${date} 记忆索引`);
  lines.push('');

  // Sort by importance desc
  const sorted = [...notes].sort((a, b) => b.importance - a.importance);

  for (const note of sorted) {
    let topics: string[] = [];
    try {
      topics = JSON.parse(note.topics);
    } catch {
      /* ignore */
    }

    const fileName = path.basename(note.filePath);
    lines.push(`## ${topics.join(', ') || '未分类'}`);
    lines.push('');
    lines.push(`- **文件**: ${fileName}`);
    if (topics.length) lines.push(`- **主题**: ${topics.join(', ')}`);
    lines.push(`- **摘要**: ${note.summary || '(无摘要)'}`);
    lines.push(`- **重要度**: ${note.importance}`);
    lines.push('');
  }

  const relPath = `memory/daily/${year}/${month}/${date}.index.md`;
  const absPath = path.join(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, lines.join('\n'), 'utf-8');

  return { filePath: relPath, noteCount: notes.length };
}

// ━━ Topic Archive ━━

export async function generateTopicArchive(topicId: string, workspaceRoot: string, db: ContentGenDbDeps, workspaceId?: string): Promise<{ filePath: string; noteCount: number }> {
  const topics = await db.listAllTopics(workspaceId, 1000);
  const topic = topics.find((t) => t.id === topicId);
  if (!topic) return { filePath: '', noteCount: 0 };

  const notes = await db.listNotesByTopicId(topicId, workspaceId, 100);
  const lines: string[] = [];

  lines.push('---');
  lines.push(`topic: '${topic.label}'`);
  lines.push(`slug: '${topic.slug}'`);
  lines.push(`heat: ${topic.heat ?? 0}`);
  lines.push(`noteCount: ${notes.length}`);
  lines.push(`generatedAt: '${new Date().toISOString()}'`);
  lines.push('---');
  lines.push('');
  lines.push(`# ${topic.label}`);
  lines.push('');
  if (topic.description) {
    lines.push(topic.description);
    lines.push('');
  }
  lines.push(`> 热度: ${(topic.heat ?? 0).toFixed(2)} | 关联笔记: ${notes.length} 条`);
  lines.push('');

  if (notes.length > 0) {
    lines.push('## 相关记忆');
    lines.push('');

    const sorted = [...notes].sort((a, b) => b.importance - a.importance);
    for (const note of sorted) {
      const fileName = path.basename(note.filePath);
      lines.push(`### ${note.date} — ${note.summary?.slice(0, 60) || '(无摘要)'}`);
      lines.push('');
      lines.push(`- **文件**: ${fileName}`);
      lines.push(`- **重要度**: ${note.importance}`);
      if (note.summary) lines.push(`- **摘要**: ${note.summary}`);
      lines.push('');
    }
  }

  const relPath = `memory/topics/${topic.slug}.md`;
  const absPath = path.join(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, lines.join('\n'), 'utf-8');

  return { filePath: relPath, noteCount: notes.length };
}

export async function generateAllTopicArchives(workspaceRoot: string, db: ContentGenDbDeps, workspaceId?: string): Promise<{ generated: number; errors: string[] }> {
  const topics = await db.listAllTopics(workspaceId, 500);
  let generated = 0;
  const errors: string[] = [];

  for (const topic of topics) {
    try {
      const result = await generateTopicArchive(topic.id, workspaceRoot, db, workspaceId);
      if (result.filePath) generated++;
    } catch (err: any) {
      errors.push(`${topic.slug}: ${err?.message}`);
    }
  }

  return { generated, errors };
}

// ━━ MEMORY.md ━━

export async function generateMemoryIndex(workspaceRoot: string, db: ContentGenDbDeps, workspaceId?: string): Promise<{ filePath: string; topicCount: number; noteCount: number }> {
  const topics = await db.listAllTopics(workspaceId, 500);
  const notes = workspaceId ? await db.listNotesByWorkspace(workspaceId, 1000, 0) : [];

  const lines: string[] = [];

  lines.push('---');
  lines.push(`topicCount: ${topics.length}`);
  lines.push(`noteCount: ${notes.length}`);
  lines.push(`generatedAt: '${new Date().toISOString()}'`);
  lines.push('---');
  lines.push('');
  lines.push('# 记忆索引');
  lines.push('');
  lines.push(`> ${topics.length} 个主题 | ${notes.length} 条记忆`);
  lines.push('');

  // Top topics by heat
  if (topics.length > 0) {
    lines.push('## 热门主题');
    lines.push('');
    const hotTopics = [...topics].sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0)).slice(0, 20);
    for (const t of hotTopics) {
      lines.push(`- **${t.label}** (热度 ${(t.heat ?? 0).toFixed(2)}, ${t.noteCount ?? 0} 条笔记)${t.description ? ` — ${t.description}` : ''}`);
    }
    lines.push('');
  }

  // Recent notes
  if (notes.length > 0) {
    lines.push('## 最近记忆');
    lines.push('');
    const recentNotes = [...notes].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
    let lastDate = '';
    for (const note of recentNotes) {
      if (note.date !== lastDate) {
        lines.push(`### ${note.date}`);
        lines.push('');
        lastDate = note.date;
      }
      let noteTopics: string[] = [];
      try {
        noteTopics = JSON.parse(note.topics);
      } catch {
        /* ignore */
      }
      const fileName = path.basename(note.filePath);
      lines.push(
        `- [${fileName}](daily/${note.date.replace(/-/g, '/').slice(0, 7)}/${fileName}) — ${note.summary?.slice(0, 80) || '(无摘要)'}${noteTopics.length ? ` [${noteTopics.join(', ')}]` : ''}`
      );
    }
    lines.push('');
  }

  // All topics list
  if (topics.length > 0) {
    lines.push('## 全部主题');
    lines.push('');
    const sorted = [...topics].sort((a, b) => a.label.localeCompare(b.label));
    for (const t of sorted) {
      lines.push(`- [${t.label}](topics/${t.slug}.md) (${t.noteCount ?? 0} 条笔记)`);
    }
    lines.push('');
  }

  const relPath = 'memory/MEMORY.md';
  const absPath = path.join(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, lines.join('\n'), 'utf-8');

  return { filePath: relPath, topicCount: topics.length, noteCount: notes.length };
}
