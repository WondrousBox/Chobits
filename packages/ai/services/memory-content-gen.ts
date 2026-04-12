/**
 * Memory Content Generation Service
 *
 * 生成记忆系统的辅助内容文件：
 * 1. Daily Index (YYYY-MM-DD.index.md) — 当天所有记忆 note 的概览
 * 2. Topic Archive (topics/topic-slug.md) — 主题长期汇总
 * 3. MEMORY.md — 长期记忆摘要（供未来回忆使用）
 * 4. INDEX.md — 全局浏览索引（供人工浏览）
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
      stability: number;
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

interface MemoryDigestCandidate {
  date: string;
  daysAgo: number;
  id: string;
  importance: number;
  keyPoints: string[];
  markdownCharCount: number;
  openItems: string[];
  priorityScore: number;
  recallCues: MemoryRecallCue[];
  recencyScore: number;
  stability: number;
  summary: string;
  topics: string[];
}

type MemoryRecallCueType = 'ongoing' | 'decision' | 'principle' | 'event' | 'follow_up';

type MemoryLifecycleAction = 'archive' | 'freeze' | 'refresh' | 'compact';

interface MemoryRecallCue {
  statement: string;
  type: MemoryRecallCueType;
}

interface MemoryLifecycleSuggestion {
  action: MemoryLifecycleAction;
  note: MemoryDigestCandidate;
  score: number;
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

function normalizeInlineText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncateInlineText(text: string, maxChars: number): string {
  const normalized = normalizeInlineText(text);
  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function parseJsonStringArray(value: string | null | undefined): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').map((item) => normalizeInlineText(item)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSectionBody(markdown: string, heading: string): string {
  const lines = markdown.split(/\r?\n/);
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);
  let startIndex = -1;

  for (let index = 0; index < lines.length; index++) {
    if (headingPattern.test(lines[index])) {
      startIndex = index + 1;
      break;
    }
  }

  if (startIndex < 0) {
    return '';
  }

  let endIndex = lines.length;
  for (let index = startIndex; index < lines.length; index++) {
    if (/^##\s+/.test(lines[index])) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}

function extractMarkdownBullets(sectionBody: string): string[] {
  return sectionBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => normalizeInlineText(line.slice(2)))
    .filter(Boolean);
}

function normalizeRecallCueType(rawType: string): MemoryRecallCueType | null {
  const normalized = normalizeInlineText(rawType).toLowerCase();
  if (normalized === 'ongoing') return 'ongoing';
  if (normalized === 'decision') return 'decision';
  if (normalized === 'principle') return 'principle';
  if (normalized === 'event') return 'event';
  if (normalized === 'follow_up' || normalized === 'follow-up' || normalized === 'follow up' || normalized === 'followup') return 'follow_up';
  return null;
}

function extractRecallCues(sectionBody: string): MemoryRecallCue[] {
  const cues: MemoryRecallCue[] = [];

  for (const bullet of extractMarkdownBullets(sectionBody)) {
    const match = bullet.match(/^\[([^\]]+)\]\s*(.+)$/);
    if (!match) {
      continue;
    }

    const type = normalizeRecallCueType(match[1]);
    const statement = normalizeInlineText(match[2]);
    if (!type || !statement) {
      continue;
    }

    cues.push({ statement, type });
  }

  return cues;
}

function computeDaysAgo(date: string, now = Date.now()): number {
  const value = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(value)) {
    return 3650;
  }

  return Math.max(0, Math.floor((now - value) / (24 * 60 * 60 * 1000)));
}

function computeRecencyScore(daysAgo: number): number {
  return Math.max(0, 1 - daysAgo / 45);
}

function computePriorityScore(note: { importance: number; stability: number; recencyScore: number; openItems: string[] }): number {
  return note.importance * 0.46 + note.stability * 0.34 + note.recencyScore * 0.2 + (note.openItems.length > 0 ? 0.06 : 0);
}

function buildTopicPrefix(topics: string[]): string {
  return topics.length > 0 ? `${topics.slice(0, 2).join(' / ')}：` : '';
}

function buildOngoingLine(note: MemoryDigestCandidate): string {
  const openItemSuffix = note.openItems[0] ? ` 待跟进：${truncateInlineText(note.openItems[0], 56)}` : '';
  return `- ${note.date} · ${buildTopicPrefix(note.topics)}${truncateInlineText(note.summary, 88)}${openItemSuffix}`;
}

function buildPrincipleLine(note: MemoryDigestCandidate): string {
  const preferredPoint = note.keyPoints.find((item) => item && !normalizeInlineText(note.summary).includes(normalizeInlineText(item)));
  const content = preferredPoint || note.summary;
  return `- ${buildTopicPrefix(note.topics)}${truncateInlineText(content, 96)}`;
}

function buildRecentEventLine(note: MemoryDigestCandidate): string {
  return `- ${note.date} · ${buildTopicPrefix(note.topics)}${truncateInlineText(note.summary, 92)}`;
}

function buildRecallCueLine(note: MemoryDigestCandidate, cue: MemoryRecallCue): string {
  switch (cue.type) {
    case 'ongoing':
      return `- ${note.date} · ${buildTopicPrefix(note.topics)}${truncateInlineText(cue.statement, 92)}`;
    case 'decision':
    case 'principle':
      return `- ${buildTopicPrefix(note.topics)}${truncateInlineText(cue.statement, 98)}`;
    case 'follow_up':
      return `- ${buildTopicPrefix(note.topics)}${truncateInlineText(cue.statement, 92)}`;
    case 'event':
    default:
      return `- ${note.date} · ${buildTopicPrefix(note.topics)}${truncateInlineText(cue.statement, 92)}`;
  }
}

const PREFERENCE_SIGNAL_PATTERN =
  /\b(prefer|preference|preferably|like|dislike|avoid|default|usually|habit|workflow|style)\b|喜欢|不喜欢|偏好|习惯|倾向|默认|避免|风格|通常/i;

function hasPreferenceSignal(text: string): boolean {
  return PREFERENCE_SIGNAL_PATTERN.test(text);
}

function noteLooksLikePreference(note: MemoryDigestCandidate): boolean {
  return hasPreferenceSignal(note.summary) || note.topics.some((topic) => hasPreferenceSignal(topic)) || note.keyPoints.some((item) => hasPreferenceSignal(item));
}

function selectUserPreferenceText(note: MemoryDigestCandidate): string | null {
  const preferredCue =
    note.recallCues.find((cue) => (cue.type === 'decision' || cue.type === 'principle') && hasPreferenceSignal(cue.statement)) ??
    note.recallCues.find((cue) => hasPreferenceSignal(cue.statement));
  if (preferredCue) {
    return preferredCue.statement;
  }

  const preferredKeyPoint = note.keyPoints.find((item) => hasPreferenceSignal(item));
  if (preferredKeyPoint) {
    return preferredKeyPoint;
  }

  return noteLooksLikePreference(note) ? note.summary : null;
}

function buildUserPreferenceLine(note: MemoryDigestCandidate, text: string): string {
  return `- ${buildTopicPrefix(note.topics)}${truncateInlineText(text, 96)}`;
}

function buildActiveProjectLine(note: MemoryDigestCandidate): string {
  const topicLabel = buildLifecycleTopicLabel(note.topics);
  const anchor =
    note.recallCues.find((cue) => cue.type === 'ongoing' || cue.type === 'follow_up')?.statement ??
    note.openItems[0] ??
    note.summary;
  const nextStep = note.openItems.find((item) => normalizeInlineText(item) !== normalizeInlineText(anchor));
  const nextStepSuffix = nextStep ? ` Next: ${truncateInlineText(nextStep, 44)}` : '';
  return `- ${topicLabel}: ${truncateInlineText(anchor, 82)}${nextStepSuffix}`;
}

function buildLifecycleTopicLabel(topics: string[]): string {
  return topics.length > 0 ? topics.slice(0, 2).join(' / ') : 'Untitled memory';
}

function buildLifecycleReason(note: MemoryDigestCandidate, action: MemoryLifecycleAction): string {
  switch (action) {
    case 'archive':
      return `${note.daysAgo}d old, stable ${note.stability.toFixed(2)}, no open items`;
    case 'freeze':
      return `${note.daysAgo}d stable candidate, importance ${note.importance.toFixed(2)}`;
    case 'refresh':
      return `${note.daysAgo}d stale, stability ${note.stability.toFixed(2)}, still relevant`;
    case 'compact':
    default:
      return `${note.markdownCharCount} chars, aging note with dense content`;
  }
}

function buildLifecycleLine(suggestion: MemoryLifecycleSuggestion): string {
  const topicLabel = buildLifecycleTopicLabel(suggestion.note.topics);
  const summary = truncateInlineText(suggestion.note.summary, 84);
  const reason = buildLifecycleReason(suggestion.note, suggestion.action);
  return `- [${suggestion.action}] ${topicLabel} | ${suggestion.note.date} | ${summary} (${reason})`;
}

function classifyMemoryLifecycle(note: MemoryDigestCandidate): MemoryLifecycleSuggestion | null {
  const hasOpenItems = note.openItems.length > 0;
  const hasRecallValue = note.recallCues.length > 0 || note.importance >= 0.7 || note.stability >= 0.7;

  if (!hasOpenItems && note.daysAgo >= 90 && note.stability >= 0.78 && note.importance >= 0.7) {
    return {
      action: 'archive',
      note,
      score: note.stability * 0.45 + note.importance * 0.35 + Math.min(note.daysAgo / 180, 1) * 0.2
    };
  }

  if (!hasOpenItems && note.daysAgo >= 21 && note.stability >= 0.88 && note.importance >= 0.72) {
    return {
      action: 'freeze',
      note,
      score: note.stability * 0.5 + note.importance * 0.35 + Math.min(note.daysAgo / 60, 1) * 0.15
    };
  }

  if (note.daysAgo >= 45 && note.stability < 0.72 && hasRecallValue) {
    return {
      action: 'refresh',
      note,
      score: note.importance * 0.42 + (1 - note.stability) * 0.33 + Math.min(note.daysAgo / 120, 1) * 0.25
    };
  }

  if (note.daysAgo >= 14 && note.markdownCharCount >= 900 && note.importance >= 0.68) {
    return {
      action: 'compact',
      note,
      score: Math.min(note.markdownCharCount / 1800, 1) * 0.45 + note.importance * 0.3 + Math.min(note.daysAgo / 60, 1) * 0.25
    };
  }

  return null;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const key = normalizeInlineText(line).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(line);
  }

  return result;
}

function appendSection(lines: string[], title: string, items: string[]): void {
  const deduped = dedupeLines(items).filter(Boolean);
  if (deduped.length === 0) {
    return;
  }

  lines.push(`## ${title}`);
  lines.push('');
  lines.push(...deduped);
  lines.push('');
}

function combinePreferredLines(groups: string[][], limit: number): string[] {
  const seen = new Set<string>();
  const combined: string[] = [];

  for (const group of groups) {
    for (const line of group) {
      const key = normalizeInlineText(line).toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      combined.push(line);
      if (combined.length >= limit) {
        return combined;
      }
    }
  }

  return combined;
}

function collectUniqueTopicNotes(candidates: MemoryDigestCandidate[], limit: number): MemoryDigestCandidate[] {
  const selected: MemoryDigestCandidate[] = [];
  const seenTopicKeys = new Set<string>();

  for (const note of candidates) {
    const topicKey = normalizeInlineText(buildLifecycleTopicLabel(note.topics)).toLowerCase() || note.id;
    if (seenTopicKeys.has(topicKey)) {
      continue;
    }

    seenTopicKeys.add(topicKey);
    selected.push(note);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

async function enrichDigestCandidate(
  note: Awaited<ReturnType<ContentGenDbDeps['listNotesByWorkspace']>>[number],
  workspaceRoot: string
): Promise<MemoryDigestCandidate | null> {
  const summary = normalizeInlineText(note.summary || '');
  if (!summary) {
    return null;
  }

  let markdown = '';
  try {
    markdown = await fs.readFile(path.join(workspaceRoot, note.filePath), 'utf-8');
  } catch {
    markdown = '';
  }

  const openItems = extractMarkdownBullets(extractSectionBody(markdown, 'Open Items')).slice(0, 4);
  const keyPoints = extractMarkdownBullets(extractSectionBody(markdown, 'Key Points')).slice(0, 4);
  const recallCues = extractRecallCues(extractSectionBody(markdown, 'Recall Cues')).slice(0, 6);
  const daysAgo = computeDaysAgo(note.date);
  const recencyScore = computeRecencyScore(daysAgo);
  const stability = note.stability ?? 0.5;

  return {
    date: note.date,
    daysAgo,
    id: note.id,
    importance: note.importance ?? 0.5,
    keyPoints,
    markdownCharCount: normalizeInlineText(markdown).length,
    openItems,
    priorityScore: computePriorityScore({
      importance: note.importance ?? 0.5,
      openItems,
      recencyScore,
      stability
    }),
    recallCues,
    recencyScore,
    stability,
    summary,
    topics: parseJsonStringArray(note.topics)
  };
}

async function writeBrowseIndex(
  workspaceRoot: string,
  notes: Awaited<ReturnType<ContentGenDbDeps['listNotesByWorkspace']>>,
  topics: Awaited<ReturnType<ContentGenDbDeps['listAllTopics']>>,
  workspaceId?: string
): Promise<string> {
  const lines: string[] = [];

  lines.push('---');
  if (workspaceId) lines.push(`workspaceId: '${workspaceId}'`);
  lines.push(`topicCount: ${topics.length}`);
  lines.push(`noteCount: ${notes.length}`);
  lines.push(`generatedAt: '${new Date().toISOString()}'`);
  lines.push('---');
  lines.push('');
  lines.push('# 记忆索引');
  lines.push('');
  lines.push(`> ${topics.length} 个主题 | ${notes.length} 条记忆`);
  lines.push('');

  if (topics.length > 0) {
    lines.push('## 热门主题');
    lines.push('');
    const hotTopics = [...topics].sort((a, b) => (b.heat ?? 0) - (a.heat ?? 0)).slice(0, 20);
    for (const topic of hotTopics) {
      lines.push(`- **${topic.label}** (热度 ${(topic.heat ?? 0).toFixed(2)}, ${topic.noteCount ?? 0} 条笔记)${topic.description ? ` — ${topic.description}` : ''}`);
    }
    lines.push('');
  }

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

      const fileName = path.basename(note.filePath);
      const noteTopics = parseJsonStringArray(note.topics);
      lines.push(`- [${fileName}](daily/${note.date.replace(/-/g, '/').slice(0, 7)}/${fileName}) — ${truncateInlineText(note.summary || '(无摘要)', 80)}${noteTopics.length ? ` [${noteTopics.join(', ')}]` : ''}`);
    }
    lines.push('');
  }

  if (topics.length > 0) {
    lines.push('## 全部主题');
    lines.push('');
    const sorted = [...topics].sort((a, b) => a.label.localeCompare(b.label));
    for (const topic of sorted) {
      lines.push(`- [${topic.label}](topics/${topic.slug}.md) (${topic.noteCount ?? 0} 条笔记)`);
    }
    lines.push('');
  }

  const relPath = 'memory/INDEX.md';
  const absPath = path.join(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, lines.join('\n'), 'utf-8');
  return relPath;
}

// ━━ MEMORY.md ━━

export async function generateMemoryIndex(
  workspaceRoot: string,
  db: ContentGenDbDeps,
  workspaceId?: string
): Promise<{ filePath: string; indexFilePath: string; noteCount: number; selectedCount: number; topicCount: number }> {
  const topics = await db.listAllTopics(workspaceId, 500);
  const notes = workspaceId ? await db.listNotesByWorkspace(workspaceId, 1000, 0) : [];
  const indexFilePath = await writeBrowseIndex(workspaceRoot, notes, topics, workspaceId);
  const frontmatterDate = new Date().toISOString();
  const prioritizedNotes = [...notes]
    .filter((note) => normalizeInlineText(note.summary || '').length >= 8)
    .sort((left, right) => {
      const leftDaysAgo = computeDaysAgo(left.date);
      const rightDaysAgo = computeDaysAgo(right.date);
      const leftScore = left.importance * 0.46 + (left.stability ?? 0.5) * 0.34 + computeRecencyScore(leftDaysAgo) * 0.2;
      const rightScore = right.importance * 0.46 + (right.stability ?? 0.5) * 0.34 + computeRecencyScore(rightDaysAgo) * 0.2;
      return rightScore - leftScore;
    })
    .slice(0, 80);
  const enrichedNotes = (await Promise.all(prioritizedNotes.map((note) => enrichDigestCandidate(note, workspaceRoot)))).filter(
    (note): note is MemoryDigestCandidate => !!note
  );
  const meaningfulNotes = enrichedNotes.filter(
    (note) =>
      (note.recallCues.length > 0 && (note.importance >= 0.55 || note.stability >= 0.55 || note.openItems.length > 0)) ||
      note.importance >= 0.72 ||
      note.stability >= 0.72 ||
      (note.openItems.length > 0 && note.importance >= 0.55)
  );
  const lifecycleSuggestions = meaningfulNotes
    .map((note) => classifyMemoryLifecycle(note))
    .filter((suggestion): suggestion is MemoryLifecycleSuggestion => !!suggestion)
    .sort((left, right) => right.score - left.score);

  const lines: string[] = [];

  lines.push('---');
  if (workspaceId) lines.push(`workspaceId: '${workspaceId}'`);
  lines.push(`topicCount: ${topics.length}`);
  lines.push(`noteCount: ${notes.length}`);
  lines.push(`selectedCount: ${meaningfulNotes.length}`);
  lines.push(`indexFilePath: '${indexFilePath}'`);
  lines.push(`generatedAt: '${frontmatterDate}'`);
  lines.push('---');
  lines.push('');
  lines.push('# 长期记忆');
  lines.push('');
  lines.push('> 这里只保留未来值得回忆的重点事件、延续事项、关键决定与重要未完成项，不罗列文件索引。');
  lines.push('');

  if (meaningfulNotes.length === 0) {
    lines.push('目前还没有足够稳定且重要、值得写入长期记忆摘要的内容。');
    lines.push('');
  } else {
    const takeNotes = (candidates: MemoryDigestCandidate[], limit: number): MemoryDigestCandidate[] => candidates.slice(0, limit);

    // ━━ Critical Facts section — always-loaded compact summary ━━
    // Picks the most stable ongoing + decision/principle cues for injection into every conversation.
    const criticalFactCandidates = [...meaningfulNotes]
      .filter((note) => note.stability >= 0.6 || note.importance >= 0.75)
      .sort((left, right) => right.stability - left.stability || right.importance - left.importance);
    const criticalFactLines: string[] = [];
    for (const note of criticalFactCandidates) {
      if (criticalFactLines.length >= 5) break;
      for (const cue of note.recallCues) {
        if (criticalFactLines.length >= 5) break;
        if (cue.type === 'ongoing' || cue.type === 'decision' || cue.type === 'principle') {
          const line = `- [${cue.type}] ${buildTopicPrefix(note.topics)}${truncateInlineText(cue.statement, 96)}`;
          criticalFactLines.push(line);
        }
      }
    }
    // If no recall cues, fall back to high-stability note summaries
    if (criticalFactLines.length === 0) {
      for (const note of criticalFactCandidates.slice(0, 5)) {
        criticalFactLines.push(`- ${buildTopicPrefix(note.topics)}${truncateInlineText(note.summary, 96)}`);
      }
    }
    const userPreferenceLines = [...meaningfulNotes]
      .filter((note) => note.stability >= 0.82 || note.importance >= 0.84 || noteLooksLikePreference(note))
      .sort((left, right) => right.stability - left.stability || right.priorityScore - left.priorityScore)
      .map((note) => {
        const text = selectUserPreferenceText(note);
        return text ? buildUserPreferenceLine(note, text) : '';
      })
      .filter(Boolean)
      .slice(0, 5);
    const activeProjectCandidates = [...meaningfulNotes]
      .filter(
        (note) =>
          note.openItems.length > 0 ||
          note.recallCues.some((cue) => cue.type === 'ongoing' || cue.type === 'follow_up') ||
          (note.daysAgo <= 45 && note.importance >= 0.8)
      )
      .sort(
        (left, right) =>
          (right.openItems.length > 0 ? 1 : 0) -
            (left.openItems.length > 0 ? 1 : 0) ||
          (right.recallCues.some((cue) => cue.type === 'ongoing' || cue.type === 'follow_up') ? 1 : 0) -
            (left.recallCues.some((cue) => cue.type === 'ongoing' || cue.type === 'follow_up') ? 1 : 0) ||
          right.priorityScore - left.priorityScore
      );
    const activeProjectLines = collectUniqueTopicNotes(activeProjectCandidates, 4).map((note) => buildActiveProjectLine(note));

    appendSection(lines, 'Critical Facts', dedupeLines(criticalFactLines));
    appendSection(lines, 'User Preferences', userPreferenceLines);
    appendSection(lines, 'Active Projects', activeProjectLines);
    appendSection(lines, 'Lifecycle Suggestions', lifecycleSuggestions.slice(0, 6).map((suggestion) => buildLifecycleLine(suggestion)));

    const ongoingNotes = takeNotes(
      [...meaningfulNotes]
        .filter((note) => note.openItems.length > 0 || (note.daysAgo <= 21 && note.importance >= 0.78))
        .sort((left, right) => (right.openItems.length > 0 ? 1 : 0) - (left.openItems.length > 0 ? 1 : 0) || right.priorityScore - left.priorityScore),
      5
    );
    const ongoingCueLines = [...meaningfulNotes]
      .sort((left, right) => right.priorityScore - left.priorityScore)
      .flatMap((note) => note.recallCues.filter((cue) => cue.type === 'ongoing').map((cue) => buildRecallCueLine(note, cue)));
    appendSection(lines, '正在延续的事情', combinePreferredLines([ongoingCueLines, ongoingNotes.map((note) => buildOngoingLine(note))], 5));

    const principleNotes = takeNotes(
      [...meaningfulNotes]
        .filter((note) => note.stability >= 0.78 || note.importance >= 0.86)
        .sort((left, right) => right.stability - left.stability || right.priorityScore - left.priorityScore),
      5
    );
    const principleCueLines = [...meaningfulNotes]
      .sort((left, right) => right.priorityScore - left.priorityScore)
      .flatMap((note) =>
        note.recallCues
          .filter((cue) => cue.type === 'decision' || cue.type === 'principle')
          .map((cue) => buildRecallCueLine(note, cue))
      );
    appendSection(lines, '关键决定与长期原则', combinePreferredLines([principleCueLines, principleNotes.map((note) => buildPrincipleLine(note))], 5));

    const recentEventNotes = takeNotes(
      [...meaningfulNotes]
        .filter((note) => note.daysAgo <= 45 && note.importance >= 0.74)
        .sort((left, right) => right.priorityScore - left.priorityScore),
      4
    );
    const recentEventCueLines = [...meaningfulNotes]
      .sort((left, right) => right.priorityScore - left.priorityScore)
      .flatMap((note) => note.recallCues.filter((cue) => cue.type === 'event').map((cue) => buildRecallCueLine(note, cue)));
    appendSection(lines, '近期值得记住的事件', combinePreferredLines([recentEventCueLines, recentEventNotes.map((note) => buildRecentEventLine(note))], 4));

    const followUpCueLines = [...meaningfulNotes]
      .sort((left, right) => right.priorityScore - left.priorityScore)
      .flatMap((note) => note.recallCues.filter((cue) => cue.type === 'follow_up').map((cue) => buildRecallCueLine(note, cue)));
    const openLoopLines = ongoingNotes
      .flatMap((note) => note.openItems.map((item) => `- ${buildTopicPrefix(note.topics)}${truncateInlineText(item, 92)}`))
      .slice(0, 6);
    appendSection(lines, '待跟进', combinePreferredLines([followUpCueLines, openLoopLines], 6));

    if (!lines.some((line) => line.startsWith('## '))) {
      appendSection(lines, '长期线索', meaningfulNotes.slice(0, 5).map((note) => buildRecentEventLine(note)));
    }
  }

  const relPath = 'memory/MEMORY.md';
  const absPath = path.join(workspaceRoot, relPath);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, lines.join('\n'), 'utf-8');

  return {
    filePath: relPath,
    indexFilePath,
    noteCount: notes.length,
    selectedCount: meaningfulNotes.length,
    topicCount: topics.length
  };
}
