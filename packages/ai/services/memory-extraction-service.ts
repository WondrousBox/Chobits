/**
 * Memory Extraction Service
 * 5 步提取流水线：Collect → Split → Extract → Merge → Write
 * 从对话中提取结构化记忆，写入 Markdown 文件并建立数据库索引。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { parseJsonMarkdown } from '../json';
import { parseSections } from './memory-note-parser';
import { buildNotePath, buildSectionsMap, generateNoteId, renderNoteMarkdown } from './memory-note-writer';
import type {
  CollectedConversation,
  CollectInput,
  CollectOutput,
  ExtractionProgress,
  ExtractionResult,
  MemoryChatFn,
  MemoryExtractionOutput,
  MemoryNoteEntity,
  MemoryNoteFrontmatter,
  MergedNote,
  TopicCluster,
  TopicSplitOutput,
  WriteStats
} from './memory-types';

// ━━ Prompts ━━

const TOPIC_SPLIT_PROMPT = `将对话归纳为尽可能少的主题，用于搜索引擎索引。

**核心原则：宁可合并，不要拆分。** 只有完全不同领域/目的时才拆分。

规则：
1. 优先归纳为 1 个主题，同主题的延伸讨论不拆分
2. topicLabel：2-6 字精炼概括，不用修饰词（如"初步"、"深入"）
3. topicSlug：小写英文/拼音，连字符分隔，≤40 字符
4. conversationId 必须与标题括号中的完整 ID 一致
5. seqStart/seqEnd 使用 (seq:N) 标记的实际数字
6. 忽略无实质内容的消息

{
  "topicClusters": [
    {
      "topicLabel": "主题名称",
      "topicSlug": "topic-slug",
      "description": "该主题讨论了什么...",
      "messageRanges": [
        { "conversationId": "对话标题括号中的完整ID", "seqStart": 1, "seqEnd": 20 }
      ],
      "estimatedImportance": 0.8
    }
  ]
}
只输出 JSON，不要解释。`;

const EXTRACTION_PROMPT = `从对话中提取记忆索引，用于日后快速检索。记忆是索引而非转录，完整内容可通过 sourceConversationIds 回溯原始对话。

主题：{topicLabel}
主题描述：{description}

规则：
1. 只提取有长期价值的信息：用户偏好、关键事实、技术决策、重要结论
2. 跳过：闲聊、重复内容、过程性操作、助手的推理过程、通用知识
3. summary 用 1-2 句话概括核心要点，不要复述对话过程
4. keywords 应包含适合搜索的关键词（中英文均可），3-6 个
5. entities 只列对话中明确提到的专有名词（产品、人名、技术等）
6. sections.keyPoints 用精炼的要点列表，每条一行，格式为 "- 要点内容"，合并事实和决策
7. sections.openItems 只在有明确待办/未解决问题时才填写，否则省略

输出格式（JSON）：
{
  "topicLabel": "string",
  "topicSlug": "string",
  "summary": "1~2 句话概要",
  "importance": 0.0~1.0,
  "stability": 0.0~1.0,
  "keywords": ["kw1", "kw2"],
  "entities": [
    { "name": "ProductX", "type": "product" }
  ],
  "sections": {
    "keyPoints": "- 要点1\n- 要点2",
    "openItems": "- 待办1（可选，无则省略此字段）"
  }
}
只输出 JSON，不要解释。`;

// ━━ Service ━━

export type ProgressCallback = (progress: ExtractionProgress) => void;

export interface ExtractionContext {
  chatFn: MemoryChatFn;
  workspaceId: string;
  workspaceRoot: string;
  date: string; // YYYY-MM-DD
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

/**
 * Step 1: Collect — 收集对话消息
 * 需要调用方提供 listMessages 函数（避免直接依赖 ChatRepo）
 */
export async function collect(
  input: CollectInput,
  listMessages: (convId: string) => Promise<Array<{ role: string; content: string; seq: number; createdAt: number }>>,
  getConversation: (convId: string) => Promise<{ id: string; title?: string | null } | undefined>
): Promise<CollectOutput> {
  const TAG = '[MemoryExtraction:collect]';
  const conversations: CollectedConversation[] = [];

  console.log(`${TAG} 🧠📚 Collecting from ${input.conversationIds.length} conversations, watermarks=${input.watermarks ? 'yes' : 'no'}`);

  for (const convId of input.conversationIds) {
    const conv = await getConversation(convId);
    if (!conv) {
      console.warn(`${TAG} Conv ${convId} not found, skipping`);
      continue;
    }

    const allMessages = await listMessages(convId);
    const watermark = input.watermarks?.get(convId) ?? 0;

    const newMessages = allMessages
      .filter((m) => m.seq > watermark && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        seq: m.seq,
        createdAt: m.createdAt ?? Date.now()
      }));

    console.log(`${TAG} Conv ${convId} ("${conv.title || '(no title)'}"):  total=${allMessages.length}, watermark=${watermark}, eligible=${newMessages.length}`);

    if (newMessages.length === 0) continue;

    conversations.push({
      conversationId: convId,
      title: conv.title ?? undefined,
      messages: newMessages
    });
  }

  const totalMessageCount = conversations.reduce((sum, c) => sum + c.messages.length, 0);
  const allTimestamps = conversations.flatMap((c) => c.messages.map((m) => m.createdAt));
  const dateRange = {
    start: allTimestamps.length ? new Date(Math.min(...allTimestamps)).toISOString().slice(0, 10) : '',
    end: allTimestamps.length ? new Date(Math.max(...allTimestamps)).toISOString().slice(0, 10) : ''
  };

  console.log(`${TAG} 🧠📚 Collected ${totalMessageCount} messages from ${conversations.length} conversations, dateRange=${dateRange.start}~${dateRange.end}`);
  return { conversations, totalMessageCount, dateRange };
}

/**
 * Step 2: Split — 主题拆分
 */
export async function splitTopics(collected: CollectOutput, ctx: ExtractionContext): Promise<TopicSplitOutput> {
  const TAG = '[MemoryExtraction:split] ✂️';
  ctx.onProgress?.({ stage: 'split', current: 0, total: 1, message: '正在分析对话主题...' });

  const conversationText = collected.conversations
    .map((c) => {
      const header = c.title ? `### 对话：${c.title} (${c.conversationId})` : `### 对话：${c.conversationId}`;
      const messages = c.messages.map((m) => `[${m.role}] (seq:${m.seq}) ${m.content}`).join('\n');
      return `${header}\n${messages}`;
    })
    .join('\n\n---\n\n');

  const prompt = `${TOPIC_SPLIT_PROMPT}\n\n---\n\n对话内容：\n${conversationText}`;
  console.log(`${TAG} Sending split prompt to LLM (${prompt.length} chars)...`);

  const splitStart = Date.now();
  const response = await ctx.chatFn(prompt, ctx.signal);
  const splitElapsed = ((Date.now() - splitStart) / 1000).toFixed(1);
  console.log(`${TAG} LLM response received (${response.length} chars) [${splitElapsed}s]`);

  const parsed = parseJsonMarkdown(response) as TopicSplitOutput | null;

  if (!parsed?.topicClusters?.length) {
    console.warn(`${TAG} LLM returned no topic clusters. Raw response (first 500 chars): ${response.slice(0, 500)}`);
    return { topicClusters: [] };
  }

  // Validate and sanitize each cluster (partial JSON may have missing fields)
  parsed.topicClusters = parsed.topicClusters.filter((c) => {
    if (!c.topicLabel || !c.topicSlug) {
      console.warn(`${TAG} Skipping cluster with missing topicLabel/topicSlug: ${JSON.stringify(c).slice(0, 200)}`);
      return false;
    }
    if (!Array.isArray(c.messageRanges)) c.messageRanges = [];
    c.messageRanges = c.messageRanges.filter((r) => r.conversationId && typeof r.seqStart === 'number' && typeof r.seqEnd === 'number');
    c.description = c.description || '';
    c.estimatedImportance = c.estimatedImportance ?? 0.5;
    return true;
  });

  if (!parsed.topicClusters.length) {
    console.warn(`${TAG} All clusters filtered out after validation`);
    return { topicClusters: [] };
  }

  console.log(`${TAG} Identified ${parsed.topicClusters.length} topic(s): ${parsed.topicClusters.map((c) => `"${c.topicLabel}" (importance=${c.estimatedImportance})`).join(', ')}`);
  ctx.onProgress?.({ stage: 'split', current: 1, total: 1, message: `识别到 ${parsed.topicClusters.length} 个主题` });
  return parsed;
}

/**
 * Step 3: Extract — 对每个主题块调用 LLM 结构化提取
 */
export async function extractMemory(cluster: TopicCluster, collected: CollectOutput, ctx: ExtractionContext): Promise<MemoryExtractionOutput | null> {
  const TAG = `[MemoryExtraction:extract "${cluster.topicSlug}"]`;

  const collectedConvIds = collected.conversations.map((c) => c.conversationId);
  const rangeConvIds = cluster.messageRanges.map((r) => r.conversationId);
  console.log(`${TAG} Matching messages — collected convIds: ${JSON.stringify(collectedConvIds)}, range convIds: ${JSON.stringify(rangeConvIds)}, ranges: ${JSON.stringify(cluster.messageRanges)}`);

  let relevantMessages = collected.conversations.flatMap((c) => {
    // 精确匹配 + 模糊匹配（LLM 可能返回截断/变形的 conversationId）
    const ranges = cluster.messageRanges.filter((r) => r.conversationId === c.conversationId || c.conversationId.includes(r.conversationId) || r.conversationId.includes(c.conversationId));
    if (!ranges.length) return [];
    return c.messages.filter((m) => ranges.some((r) => m.seq >= r.seqStart && m.seq <= r.seqEnd));
  });

  // 回退：如果精确+模糊匹配都失败，但只有一个 conversation，直接用 seq 范围匹配
  if (relevantMessages.length === 0 && collected.conversations.length === 1) {
    const c = collected.conversations[0];
    const allRanges = cluster.messageRanges;
    if (allRanges.length > 0) {
      relevantMessages = c.messages.filter((m) => allRanges.some((r) => m.seq >= r.seqStart && m.seq <= r.seqEnd));
      if (relevantMessages.length > 0) {
        console.log(`${TAG} Fallback: matched ${relevantMessages.length} messages by seq range only (ignoring convId mismatch)`);
      }
    }
  }

  // 最终回退：如果还是空，把该 conversation 的所有消息都拿来做提取
  if (relevantMessages.length === 0 && collected.conversations.length === 1) {
    relevantMessages = collected.conversations[0].messages;
    console.log(`${TAG} Final fallback: using ALL ${relevantMessages.length} messages from single conversation`);
  }

  if (relevantMessages.length === 0) {
    console.warn(`${TAG} No relevant messages found for topic "${cluster.topicLabel}" (multi-conv scenario, no match)`);
    return null;
  }

  console.log(`${TAG} Found ${relevantMessages.length} relevant messages`);

  const conversationText = relevantMessages.map((m) => `[${m.role}] ${m.content}`).join('\n');

  const prompt = EXTRACTION_PROMPT.replace('{topicLabel}', cluster.topicLabel).replace('{description}', cluster.description) + `\n\n---\n\n对话内容：\n${conversationText}`;
  console.log(`${TAG} 🧠🔍 Sending extraction prompt to LLM (${prompt.length} chars)...`);

  const extractStart = Date.now();
  const response = await ctx.chatFn(prompt, ctx.signal);
  const extractElapsed = ((Date.now() - extractStart) / 1000).toFixed(1);
  console.log(`${TAG} 🧠🔍 LLM response received (${response.length} chars) [${extractElapsed}s]`);

  const parsed = parseJsonMarkdown(response) as MemoryExtractionOutput | null;
  if (!parsed || !parsed.topicLabel || !parsed.topicSlug) {
    console.warn(`${TAG} Failed to parse extraction result or missing required fields. Raw response (first 500 chars): ${response.slice(0, 500)}`);
    return null;
  }
  // Sanitize fields that may be missing from partial JSON
  parsed.summary = parsed.summary || '';
  parsed.keywords = Array.isArray(parsed.keywords) ? parsed.keywords : [];
  parsed.importance = parsed.importance ?? 0.5;
  parsed.stability = parsed.stability ?? 0.5;
  parsed.sections = parsed.sections || { keyPoints: '' };
  parsed.sections.keyPoints = parsed.sections.keyPoints || '';

  console.log(`${TAG} 🧠🔍 Extracted: summary="${parsed.summary?.slice(0, 80)}...", keywords=${parsed.keywords?.length}, sections=${Object.keys(parsed.sections || {}).length}`);
  return parsed;
}

/**
 * Step 4: Merge — 与已有 note 合并
 */
export function mergeMemory(
  extraction: MemoryExtractionOutput,
  existingNote: { id: string; frontmatter: MemoryNoteFrontmatter; sections: Map<string, string> } | null,
  ctx: ExtractionContext,
  sourceConversationIds: string[],
  sourceMessageRanges: Array<{ conversationId: string; seqStart: number; seqEnd: number }>
): MergedNote {
  const now = Date.now();

  if (!existingNote) {
    // 全新 note
    const noteId = generateNoteId(ctx.date, extraction.topicSlug);
    const filePath = buildNotePath(ctx.date, extraction.topicSlug);

    const frontmatter: MemoryNoteFrontmatter = {
      id: noteId,
      version: 1,
      workspaceId: ctx.workspaceId,
      date: ctx.date,
      topics: [extraction.topicLabel],
      keywords: extraction.keywords || [],
      entities: extraction.entities,
      summary: extraction.summary,
      sourceConversationIds,
      sourceMessageRange: sourceMessageRanges,
      importance: extraction.importance ?? 0.5,
      stability: extraction.stability ?? 0.5,
      createdAt: now,
      updatedAt: now
    };

    return {
      action: 'create',
      noteId,
      frontmatter,
      sections: buildSectionsMap(extraction.sections),
      filePath
    };
  }

  // 增量合并
  const mergedFrontmatter: MemoryNoteFrontmatter = {
    ...existingNote.frontmatter,
    version: existingNote.frontmatter.version + 1,
    keywords: dedup([...existingNote.frontmatter.keywords, ...(extraction.keywords || [])]),
    entities: mergeEntities(existingNote.frontmatter.entities || [], extraction.entities || []),
    importance: Math.max(existingNote.frontmatter.importance, extraction.importance ?? 0.5),
    stability: extraction.stability ?? existingNote.frontmatter.stability,
    sourceConversationIds: dedup([...existingNote.frontmatter.sourceConversationIds, ...sourceConversationIds]),
    sourceMessageRange: [...(existingNote.frontmatter.sourceMessageRange || []), ...sourceMessageRanges],
    updatedAt: now
  };

  // Section 合并：新内容追加到已有 section
  const mergedSections = new Map(existingNote.sections);
  const newSections = buildSectionsMap(extraction.sections);
  for (const [heading, content] of newSections) {
    const existing = mergedSections.get(heading);
    if (existing) {
      mergedSections.set(heading, `${existing}\n\n${content}`);
    } else {
      mergedSections.set(heading, content);
    }
  }

  return {
    action: 'update',
    noteId: existingNote.id,
    frontmatter: mergedFrontmatter,
    sections: mergedSections,
    filePath: buildNotePath(ctx.date, extraction.topicSlug)
  };
}

/**
 * Step 5: Write — 落盘 + 建索引
 * 返回写入统计。数据库操作需由调用方传入（避免直接依赖 electron/main/db）。
 */
export interface WriteDbOps {
  upsertNote: (note: any) => Promise<any>;
  rebuildSections: (noteId: string, sections: any[]) => Promise<any>;
  upsertTopic: (topic: any) => Promise<any>;
  upsertEdges: (edges: any[]) => Promise<number>;
  upsertKeywords: (noteId: string, keywords: string[], entities: any[], workspaceId: string) => Promise<number>;
  rebuildFTS: (noteId: string, noteData: any, sections: any[]) => void;
}

export async function writeMemory(merged: MergedNote, ctx: { workspaceRoot: string }, dbOps: WriteDbOps): Promise<WriteStats> {
  const TAG = `[MemoryExtraction:write "${merged.noteId}"]`;
  const stats: WriteStats = { notesCreated: 0, notesUpdated: 0, topicsCreated: 0, edgesCreated: 0, keywordsCreated: 0 };

  // 5a. 写 Markdown 文件（事务外）
  const absolutePath = path.join(ctx.workspaceRoot, merged.filePath);
  console.log(`${TAG} 🧠💾 Writing markdown to: ${absolutePath}`);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const markdownContent = renderNoteMarkdown(merged);
  await fs.writeFile(absolutePath, markdownContent, 'utf-8');
  console.log(`${TAG} 🧠💾 Markdown written: ${markdownContent.length} chars`);

  // 解析 sections（从生成的 Markdown 内容解析行号）
  const parsedSections = parseSections(markdownContent, merged.noteId);

  // 5b. upsert memory_notes
  const noteRow = {
    id: merged.noteId,
    version: merged.frontmatter.version,
    workspaceId: merged.frontmatter.workspaceId,
    date: merged.frontmatter.date,
    timeRangeStart: merged.frontmatter.timeRange?.start,
    timeRangeEnd: merged.frontmatter.timeRange?.end,
    filePath: merged.filePath,
    topics: JSON.stringify(merged.frontmatter.topics),
    parentTopicId: merged.frontmatter.parentTopicId,
    relatedTopicIds: merged.frontmatter.relatedTopicIds ? JSON.stringify(merged.frontmatter.relatedTopicIds) : null,
    keywords: JSON.stringify(merged.frontmatter.keywords),
    aliases: merged.frontmatter.aliases ? JSON.stringify(merged.frontmatter.aliases) : null,
    entities: merged.frontmatter.entities ? JSON.stringify(merged.frontmatter.entities) : null,
    summary: merged.frontmatter.summary,
    sourceConversationIds: JSON.stringify(merged.frontmatter.sourceConversationIds),
    sourceMessageRange: merged.frontmatter.sourceMessageRange ? JSON.stringify(merged.frontmatter.sourceMessageRange) : null,
    importance: merged.frontmatter.importance,
    stability: merged.frontmatter.stability,
    sectionCount: parsedSections.length,
    charCount: markdownContent.length,
    tokenEstimate: Math.round(markdownContent.length / 2.5),
    createdAt: merged.frontmatter.createdAt,
    updatedAt: merged.frontmatter.updatedAt
  };
  await dbOps.upsertNote(noteRow);
  if (merged.action === 'create') stats.notesCreated++;
  else stats.notesUpdated++;

  // 5c. rebuild sections
  const sectionRows = parsedSections.map((sec, idx) => ({
    noteId: merged.noteId,
    heading: sec.heading,
    headingLevel: sec.headingLevel,
    sectionOrder: idx,
    summary: sec.summary,
    keywords: sec.keywords?.length ? JSON.stringify(sec.keywords) : null,
    lineStart: sec.lineStart,
    lineEnd: sec.lineEnd,
    charCount: sec.charCount
  }));
  await dbOps.rebuildSections(merged.noteId, sectionRows);

  // 5d. upsert topics
  const slugify = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

  for (const topicLabel of merged.frontmatter.topics) {
    const result = await dbOps.upsertTopic({
      label: topicLabel,
      slug: slugify(topicLabel),
      workspaceId: merged.frontmatter.workspaceId,
      heat: 1.0,
      noteCount: 1,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now()
    });
    if (result) stats.topicsCreated++;
  }

  // 5e. upsert edges (topic → note)
  const edges = merged.frontmatter.topics.map((topicLabel) => ({
    sourceType: 'topic' as const,
    sourceId: `topic_${slugify(topicLabel)}`,
    targetType: 'note' as const,
    targetId: merged.noteId,
    relationType: 'belongs_to_topic' as const,
    workspaceId: merged.frontmatter.workspaceId
  }));
  stats.edgesCreated += await dbOps.upsertEdges(edges);

  // 5f. upsert keywords
  stats.keywordsCreated += await dbOps.upsertKeywords(merged.noteId, merged.frontmatter.keywords, merged.frontmatter.entities || [], merged.frontmatter.workspaceId);

  // 5g. rebuild FTS
  const topics = merged.frontmatter.topics;
  const keywords = merged.frontmatter.keywords;
  const entities = (merged.frontmatter.entities || []).map((e) => e.name);

  // Collect all section content for FTS body (so key points are searchable)
  const allSectionContent = Array.from(merged.sections.values()).join('\n');
  const ftsBody = [merged.frontmatter.summary, allSectionContent].filter(Boolean).join('\n');

  dbOps.rebuildFTS(
    merged.noteId,
    {
      title: topics.join(' '),
      summary: merged.frontmatter.summary,
      keywords: keywords.join(' '),
      aliases: '',
      entities: entities.join(' '),
      body: ftsBody
    },
    parsedSections.map((sec) => {
      // Use actual section content from merged.sections for FTS body,
      // not parsedSections.summary which only captures blockquotes
      const sectionContent = merged.sections.get(sec.heading) || sec.summary;
      return {
        id: `${merged.noteId}_sec_${sec.heading.replace(/\s+/g, '_').toLowerCase()}`,
        title: sec.heading,
        summary: sec.summary || sectionContent.slice(0, 200),
        keywords: (sec.keywords || []).join(' '),
        aliases: '',
        entities: '',
        body: sectionContent
      };
    })
  );

  return stats;
}

/**
 * 完整的提取流水线：串联 5 个步骤
 */
export async function runExtractionPipeline(
  input: CollectInput,
  ctx: ExtractionContext,
  deps: {
    listMessages: (convId: string) => Promise<Array<{ role: string; content: string; seq: number; createdAt: number }>>;
    getConversation: (convId: string) => Promise<{ id: string; title?: string | null } | undefined>;
    findExistingNote: (date: string, topicSlug: string, workspaceId: string) => Promise<{ id: string; frontmatter: MemoryNoteFrontmatter; sections: Map<string, string> } | null>;
    dbOps: Parameters<typeof writeMemory>[2];
  }
): Promise<ExtractionResult> {
  const TAG = '[MemoryExtraction:pipeline]';
  const result: ExtractionResult = {
    succeeded: [],
    failed: [],
    stats: { notesCreated: 0, notesUpdated: 0, topicsCreated: 0, edgesCreated: 0, keywordsCreated: 0 }
  };

  const pipelineStart = Date.now();
  console.log(`${TAG} 🧠📀 ========== Pipeline START ==========`);
  console.log(`${TAG} 🧠📀 Input: ${input.conversationIds.length} conversations, date=${ctx.date}, ws=${ctx.workspaceId}`);

  // Step 1: Collect
  ctx.onProgress?.({ stage: 'collect', current: 0, total: 1, message: '正在收集对话数据...' });
  const collected = await collect(input, deps.listMessages, deps.getConversation);
  if (collected.totalMessageCount === 0) {
    console.warn(`${TAG} Step 1 (Collect): 0 messages collected, aborting pipeline`);
    return result;
  }
  console.log(`${TAG} 🧠① Step 1 (Collect): ✓ ${collected.totalMessageCount} messages from ${collected.conversations.length} conversations`);
  ctx.onProgress?.({ stage: 'collect', current: 1, total: 1, message: `收集到 ${collected.totalMessageCount} 条消息` });

  // Step 2: Split
  console.log(`${TAG} 🧠② Step 2 (Split): calling LLM for topic splitting...`);
  const splitResult = await splitTopics(collected, ctx);
  if (!splitResult.topicClusters.length) {
    console.warn(`${TAG} Step 2 (Split): no topic clusters identified, aborting pipeline`);
    return result;
  }
  console.log(`${TAG} 🧠② Step 2 (Split): ✓ ${splitResult.topicClusters.length} topic cluster(s)`);

  // Step 3+4+5
  const total = splitResult.topicClusters.length;
  for (let i = 0; i < total; i++) {
    const cluster = splitResult.topicClusters[i];
    console.log(`${TAG} 🧠③④⑤ [${i + 1}/${total}]: Processing topic "${cluster.topicLabel}" (slug=${cluster.topicSlug})`);
    ctx.onProgress?.({ stage: 'extract', current: i, total, currentTopic: cluster.topicLabel, message: `正在提取：${cluster.topicLabel}` });

    if (ctx.signal?.aborted) {
      console.warn(`${TAG} Aborted at topic ${i + 1}/${total}`);
      break;
    }

    try {
      // Step 3: Extract
      const extraction = await extractMemory(cluster, collected, ctx);
      if (!extraction) {
        console.warn(`${TAG} Step 3 (Extract): null result for "${cluster.topicSlug}"`);
        result.failed.push({ topicSlug: cluster.topicSlug, error: 'Extraction returned null' });
        continue;
      }
      console.log(`${TAG} 🧠③ Step 3 (Extract): ✓ for "${cluster.topicSlug}"`);

      // Step 4: Merge
      ctx.onProgress?.({ stage: 'merge', current: i, total, currentTopic: cluster.topicLabel });
      const existingNote = await deps.findExistingNote(ctx.date, extraction.topicSlug, ctx.workspaceId);
      console.log(`${TAG} 🧠④ Step 4 (Merge): existing note for "${extraction.topicSlug}": ${existingNote ? `found (id=${existingNote.id})` : 'none (will create)'}`);
      const sourceConvIds = cluster.messageRanges.map((r) => r.conversationId);
      const merged = mergeMemory(extraction, existingNote, ctx, dedup(sourceConvIds), cluster.messageRanges);
      console.log(`${TAG} 🧠④ Step 4 (Merge): ✓ action=${merged.action}, noteId=${merged.noteId}, filePath=${merged.filePath}`);

      // Step 5: Write
      ctx.onProgress?.({ stage: 'write', current: i, total, currentTopic: cluster.topicLabel });
      console.log(`${TAG} 🧠⑤ Step 5 (Write): writing to disk and DB...`);
      const writeStats = await writeMemory(merged, ctx, deps.dbOps);
      console.log(`${TAG} 🧠⑤ Step 5 (Write): ✓ stats=${JSON.stringify(writeStats)}`);

      result.stats.notesCreated += writeStats.notesCreated;
      result.stats.notesUpdated += writeStats.notesUpdated;
      result.stats.topicsCreated += writeStats.topicsCreated;
      result.stats.edgesCreated += writeStats.edgesCreated;
      result.stats.keywordsCreated += writeStats.keywordsCreated;
      result.succeeded.push({ topicSlug: cluster.topicSlug, noteId: merged.noteId });
    } catch (err: any) {
      console.error(`${TAG} FAILED to process topic "${cluster.topicSlug}":`, err?.message || err);
      if (err?.stack) console.error(err.stack);
      result.failed.push({ topicSlug: cluster.topicSlug, error: err?.message || String(err) });
    }
  }

  const elapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);
  console.log(`${TAG} 🧠🏁 ========== Pipeline END (${elapsed}s) ==========`);
  console.log(`${TAG} 🧠🏁 Result: succeeded=${result.succeeded.length}, failed=${result.failed.length}, stats=${JSON.stringify(result.stats)}`);
  return result;
}

// ━━ Helpers ━━

function dedup<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function mergeEntities(existing: MemoryNoteEntity[], incoming: MemoryNoteEntity[]): MemoryNoteEntity[] {
  const map = new Map<string, MemoryNoteEntity>();
  for (const e of existing) map.set(e.name.toLowerCase(), e);
  for (const e of incoming) map.set(e.name.toLowerCase(), e);
  return Array.from(map.values());
}
