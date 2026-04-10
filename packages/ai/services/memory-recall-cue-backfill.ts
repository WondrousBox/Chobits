import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { WriteDbOps } from './memory-extraction-service';
import { writeMemory } from './memory-extraction-service';
import { parseFrontmatter } from './memory-note-parser';
import { normalizeRecallCueSection } from './memory-recall-cue-utils';
import { logMemoryTrace, shortTraceId } from './memory-trace';
import type { ExtractionProgress, ExtractionResult, MemoryChatFn, MemoryNoteFrontmatter, MergedNote } from './memory-types';

const RECALL_CUE_BACKFILL_PROMPT = `你在为已有的 Memory Note 补写 Recall Cues 段落。

目标：从现有 note 中提炼出“未来值得回忆”的长期记忆候选，供 MEMORY.md 优先使用。

规则：
1. 只输出 Recall Cues 段落内容，不要输出标题、解释或 JSON。
2. 每条必须使用 "- [kind] 内容" 格式。
3. kind 只能是：ongoing、decision、principle、event、follow_up。
4. 只保留真正值得未来回忆的重点：关键决定、长期原则、正在延续的重要事情、值得记住的事件、重要待跟进。
5. 不要写流水账，不要重复 summary，不要罗列文件路径、topic 导航、无意义引用。
6. 最多 4 条，宁缺毋滥。
7. 如果这份 note 不足以形成长期记忆候选，输出空字符串。`;

export interface RecallCueBackfillNoteRow {
  id: string;
  date: string;
  filePath: string;
  importance: number;
  stability: number;
  sourceConversationIds?: string | null;
  summary: string;
  topics?: string | null;
}

interface LoadedRecallCueCandidate {
  frontmatter: MemoryNoteFrontmatter;
  row: RecallCueBackfillNoteRow;
  sections: Map<string, string>;
}

export interface RecallCueBackfillOptions {
  chatFn: MemoryChatFn;
  dbOps: WriteDbOps;
  explicitTargetIds?: boolean;
  limit?: number;
  notes: RecallCueBackfillNoteRow[];
  onProgress?: (progress: ExtractionProgress) => void;
  signal?: AbortSignal;
  workspaceId: string;
  workspaceRoot: string;
}

export interface RecallCueBackfillResult extends ExtractionResult {
  scannedCount: number;
  skippedCount: number;
  updatedCount: number;
}

export async function findRecallCueBackfillCandidates(
  workspaceRoot: string,
  notes: RecallCueBackfillNoteRow[],
  options: { explicitTargetIds?: boolean; limit?: number }
): Promise<RecallCueBackfillNoteRow[]> {
  const result: RecallCueBackfillNoteRow[] = [];

  for (const row of notes) {
    const loaded = await loadRecallCueCandidate(workspaceRoot, row, options.explicitTargetIds);
    if (!loaded) {
      continue;
    }
    result.push(row);
    if (options.limit && result.length >= options.limit) {
      break;
    }
  }

  return result;
}

export async function backfillRecallCues(options: RecallCueBackfillOptions): Promise<RecallCueBackfillResult> {
  const traceWorkspaceId = shortTraceId(options.workspaceId);
  const limit = Math.max(1, options.limit ?? (options.explicitTargetIds ? options.notes.length || 1 : 5));
  const candidates: LoadedRecallCueCandidate[] = [];

  logMemoryTrace({
    event: 'recall_cue.backfill.start',
    explicitTargetIds: !!options.explicitTargetIds,
    limit,
    requestedCount: options.notes.length,
    workspaceId: traceWorkspaceId
  });

  options.onProgress?.({
    stage: 'collect',
    current: 0,
    total: options.notes.length || 1,
    message: '正在扫描缺少 Recall Cues 的记忆 note...'
  });

  for (const row of options.notes) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    const loaded = await loadRecallCueCandidate(options.workspaceRoot, row, options.explicitTargetIds);
    if (!loaded) {
      continue;
    }

    candidates.push(loaded);
    if (candidates.length >= limit) {
      break;
    }
  }

  const result: RecallCueBackfillResult = {
    failed: [],
    scannedCount: candidates.length,
    skippedCount: 0,
    stats: { edgesCreated: 0, keywordsCreated: 0, notesCreated: 0, notesUpdated: 0, topicsCreated: 0 },
    succeeded: [],
    updatedCount: 0
  };

  if (candidates.length === 0) {
    logMemoryTrace({
      event: 'recall_cue.backfill.result',
      failedCount: 0,
      scannedCount: 0,
      skippedCount: 0,
      updatedCount: 0,
      workspaceId: traceWorkspaceId
    });
    return result;
  }

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const noteTraceId = shortTraceId(candidate.row.id);

    if (options.signal?.aborted) {
      throw createAbortError();
    }

    options.onProgress?.({
      stage: 'extract',
      current: index,
      total: candidates.length,
      currentTopic: candidate.frontmatter.topics?.[0] || candidate.row.id,
      message: `正在补写 Recall Cues：${candidate.frontmatter.topics?.[0] || candidate.row.id}`
    });

    try {
      const raw = await options.chatFn(buildRecallCueBackfillPrompt(candidate), options.signal);
      const normalized = normalizeRecallCueOutput(raw);

      if (!normalized) {
        result.skippedCount += 1;
        logMemoryTrace({
          event: 'recall_cue.backfill.note.skip',
          noteId: noteTraceId,
          reason: 'model_returned_empty',
          workspaceId: traceWorkspaceId
        });
        continue;
      }

      const mergedSections = new Map(candidate.sections);
      mergedSections.set('Recall Cues', normalized);
      const updatedFrontmatter: MemoryNoteFrontmatter = {
        ...candidate.frontmatter,
        updatedAt: Date.now()
      };

      options.onProgress?.({
        stage: 'write',
        current: index,
        total: candidates.length,
        currentTopic: candidate.frontmatter.topics?.[0] || candidate.row.id,
        message: `正在写回 Recall Cues：${candidate.frontmatter.topics?.[0] || candidate.row.id}`
      });

      const writeStats = await writeMemory(
        {
          action: 'update',
          filePath: candidate.row.filePath,
          frontmatter: updatedFrontmatter,
          noteId: candidate.row.id,
          sections: mergedSections
        } satisfies MergedNote,
        { workspaceRoot: options.workspaceRoot },
        options.dbOps
      );

      result.stats.notesCreated += writeStats.notesCreated;
      result.stats.notesUpdated += writeStats.notesUpdated;
      result.stats.topicsCreated += writeStats.topicsCreated;
      result.stats.edgesCreated += writeStats.edgesCreated;
      result.stats.keywordsCreated += writeStats.keywordsCreated;
      result.updatedCount += 1;
      result.succeeded.push({
        noteId: candidate.row.id,
        topicSlug: path.basename(candidate.row.filePath, '.md')
      });

      logMemoryTrace({
        event: 'recall_cue.backfill.note.result',
        noteId: noteTraceId,
        recallCueCount: normalized.split('\n').length,
        workspaceId: traceWorkspaceId
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({
        error: message,
        topicSlug: path.basename(candidate.row.filePath, '.md')
      });
      logMemoryTrace(
        {
          error: message,
          event: 'recall_cue.backfill.note.error',
          noteId: noteTraceId,
          workspaceId: traceWorkspaceId
        },
        'warn'
      );
    }
  }

  logMemoryTrace({
    event: 'recall_cue.backfill.result',
    failedCount: result.failed.length,
    scannedCount: result.scannedCount,
    skippedCount: result.skippedCount,
    updatedCount: result.updatedCount,
    workspaceId: traceWorkspaceId
  });

  return result;
}

async function loadRecallCueCandidate(workspaceRoot: string, row: RecallCueBackfillNoteRow, explicitTargetIds = false): Promise<LoadedRecallCueCandidate | null> {
  let content = '';

  try {
    content = await fs.readFile(path.join(workspaceRoot, row.filePath), 'utf-8');
  } catch {
    return null;
  }

  const { frontmatter } = parseFrontmatter(content);
  if (!frontmatter) {
    return null;
  }

  const sections = extractSections(content);
  if (sections.has('Recall Cues')) {
    return null;
  }

  const keyPoints = sections.get('Key Points')?.trim() || '';
  const openItems = sections.get('Open Items')?.trim() || '';
  const summary = (frontmatter.summary || row.summary || '').trim();
  const meetsSignalThreshold = frontmatter.importance >= 0.55 || frontmatter.stability >= 0.55 || !!openItems;

  if (!summary && !keyPoints && !openItems) {
    return null;
  }

  if (!explicitTargetIds && !meetsSignalThreshold) {
    return null;
  }

  return {
    frontmatter,
    row,
    sections
  };
}

function extractSections(content: string): Map<string, string> {
  const sections = new Map<string, string>();
  const body = stripFrontmatter(content);
  const lines = body.split('\n');
  let currentHeading = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading) {
        sections.set(currentHeading, currentContent.join('\n').trim());
      }
      currentHeading = line.replace(/^##\s+/, '').trim();
      currentContent = [];
      continue;
    }

    if (!currentHeading && !line.trim()) {
      continue;
    }

    currentContent.push(line);
  }

  if (currentHeading) {
    sections.set(currentHeading, currentContent.join('\n').trim());
  }

  return sections;
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? content.slice(match[0].length) : content;
}

function buildRecallCueBackfillPrompt(candidate: LoadedRecallCueCandidate): string {
  const topics = candidate.frontmatter.topics?.join(', ') || '(未分类)';
  const summary = (candidate.frontmatter.summary || candidate.row.summary || '').trim() || '(无摘要)';
  const keyPoints = candidate.sections.get('Key Points')?.trim() || '(无)';
  const openItems = candidate.sections.get('Open Items')?.trim() || '(无)';

  return `${RECALL_CUE_BACKFILL_PROMPT}

---

Note 元信息：
- 日期：${candidate.frontmatter.date}
- 主题：${topics}
- importance：${candidate.frontmatter.importance}
- stability：${candidate.frontmatter.stability}
- summary：${summary}

Key Points：
${keyPoints}

Open Items：
${openItems}`;
}

function normalizeRecallCueOutput(raw: string): string | undefined {
  const trimmed = unwrapCodeFence(raw).trim();
  if (!trimmed) {
    return undefined;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === 'none' || lowered === '无' || lowered === '（无）' || lowered === '空') {
    return undefined;
  }

  return normalizeRecallCueSection(trimmed);
}

function unwrapCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:\w+)?\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

function createAbortError(): Error {
  const error = new Error('Recall cue backfill aborted');
  error.name = 'AbortError';
  return error;
}
