import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { MemoryEdgeRepo, MemoryFTSRepo, MemoryKeywordRepo, MemoryNoteKeywordRepo, MemoryNoteRepo, MemorySectionRepo, MemoryTopicRepo, WorkspacesRepo } from '@packages/common/db';
import { Type } from '@sinclair/typebox';

import { parseSections } from '../../../services/memory-note-parser';
import { buildNotePath, generateNoteId, renderNoteMarkdown } from '../../../services/memory-note-writer';
import type { MemoryNoteFrontmatter, MergedNote } from '../../../services/memory-types';
import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memorySaveParameters = Type.Object({
  topic: Type.String({ description: '记忆主题标签，简短概括，如「用户偏好」「项目计划」「技术决策」' }),
  content: Type.String({ description: '要保存的记忆内容（Markdown 格式），包含用户想要记住的核心信息' }),
  keywords: Type.Array(Type.String(), { description: '关键词列表，至少 2 个，用于日后检索', minItems: 2 }),
  importance: Type.Optional(Type.Number({ description: '重要度 0.0~1.0，默认 0.7', minimum: 0, maximum: 1 })),
  summary: Type.Optional(Type.String({ description: '一句话摘要，不提供则自动截取 content 开头' }))
});

export function createPiMemorySaveTool(toolContext: PiSessionToolContext): ToolDefinition<typeof memorySaveParameters> {
  return {
    name: 'memorySaveTool',
    label: 'memorySaveTool',
    description: '将用户明确要求记住的信息保存到长期记忆。当用户说"记住"、"帮我记一下"、"保存这个"等意图时使用。不要用于临时信息，只保存用户明确想要长期保留的内容。',
    parameters: memorySaveParameters,

    async execute(_toolCallId, input) {
      try {
        const workspaceId = await resolveWorkspaceId();
        if (!workspaceId) {
          return createJsonToolResult({ success: false, error: 'No active workspace' });
        }

        const ws = await WorkspacesRepo.getById(workspaceId);
        if (!ws?.rootPath) {
          return createJsonToolResult({ success: false, error: 'Workspace root path not found' });
        }

        const now = Date.now();
        const date = new Date().toISOString().slice(0, 10);
        const topicSlug = slugify(input.topic);
        const noteId = generateNoteId(date, topicSlug);
        const filePath = buildNotePath(date, topicSlug);
        const conversationId = toolContext.conversationId;

        const summary = input.summary || input.content.slice(0, 200).replace(/\n/g, ' ').trim();

        const frontmatter: MemoryNoteFrontmatter = {
          id: noteId,
          version: 1,
          workspaceId,
          date,
          topics: [input.topic],
          keywords: input.keywords,
          summary,
          sourceConversationIds: conversationId ? [conversationId] : [],
          importance: input.importance ?? 0.7,
          stability: 0.8,
          createdAt: now,
          updatedAt: now
        };

        const sections = new Map<string, string>();
        sections.set('Overview', input.content);

        const merged: MergedNote = {
          action: 'create',
          noteId,
          frontmatter,
          sections,
          filePath
        };

        // Write markdown file
        const absolutePath = path.join(ws.rootPath, filePath);
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        const markdownContent = renderNoteMarkdown(merged);
        await fs.writeFile(absolutePath, markdownContent, 'utf-8');

        // Parse sections for DB
        const parsedSections = parseSections(markdownContent, noteId);

        // Write to DB
        await MemoryNoteRepo.upsert({
          id: noteId,
          version: 1,
          workspaceId,
          date,
          filePath,
          topics: JSON.stringify([input.topic]),
          keywords: JSON.stringify(input.keywords),
          summary,
          sourceConversationIds: JSON.stringify(conversationId ? [conversationId] : []),
          importance: input.importance ?? 0.7,
          stability: 0.8,
          sectionCount: parsedSections.length,
          charCount: markdownContent.length,
          tokenEstimate: Math.round(markdownContent.length / 2.5),
          createdAt: now,
          updatedAt: now
        });

        // Rebuild sections
        await MemorySectionRepo.rebuildForNote(
          noteId,
          parsedSections.map((sec, idx) => ({
            noteId,
            heading: sec.heading,
            headingLevel: sec.headingLevel,
            sectionOrder: idx,
            summary: sec.summary,
            keywords: sec.keywords?.length ? JSON.stringify(sec.keywords) : null,
            lineStart: sec.lineStart,
            lineEnd: sec.lineEnd,
            charCount: sec.charCount
          }))
        );

        // Upsert topic
        const existing = await MemoryTopicRepo.findBySlug(topicSlug, workspaceId);
        if (existing) {
          await MemoryTopicRepo.updateHeat(existing.id, 0.1);
        } else {
          await MemoryTopicRepo.upsert({
            id: `topic_${topicSlug}`,
            label: input.topic,
            slug: topicSlug,
            workspaceId,
            heat: 1.0,
            noteCount: 1,
            firstSeenAt: now,
            lastSeenAt: now,
            createdAt: now,
            updatedAt: now
          });
        }

        // Upsert edges (topic → note)
        await MemoryEdgeRepo.bulkUpsert([
          {
            sourceType: 'topic',
            sourceId: `topic_${topicSlug}`,
            targetType: 'note',
            targetId: noteId,
            relationType: 'belongs_to_topic',
            workspaceId,
            weight: 1.0,
            createdAt: now,
            updatedAt: now
          }
        ]);

        // Upsert keywords
        const links: any[] = [];
        for (const kw of input.keywords) {
          const canonical = kw.toLowerCase().trim();
          if (!canonical) continue;
          const row = await MemoryKeywordRepo.upsertCanonical({
            id: `kw_${canonical.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_').slice(0, 40)}`,
            canonical,
            workspaceId,
            aliases: null,
            entityType: null,
            occurrenceCount: 1,
            createdAt: now,
            updatedAt: now
          });
          if (row) {
            links.push({ keywordId: row.id, noteId, weight: 1.0, createdAt: now });
          }
        }
        if (links.length) {
          await MemoryNoteKeywordRepo.rebuildForNote(noteId, links);
        }

        // Rebuild FTS index
        MemoryFTSRepo.rebuildForNote(
          noteId,
          {
            title: input.topic,
            summary,
            keywords: input.keywords.join(' '),
            aliases: '',
            entities: '',
            body: input.content
          },
          parsedSections.map((sec) => ({
            id: `${noteId}_sec_${sec.heading.replace(/\s+/g, '_').toLowerCase()}`,
            title: sec.heading,
            summary: sec.summary,
            keywords: (sec.keywords || []).join(' '),
            aliases: '',
            entities: '',
            body: sec.summary
          }))
        );

        return createJsonToolResult({
          success: true,
          noteId,
          topic: input.topic,
          filePath,
          message: `记忆已保存：${input.topic}`
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to save memory'
        });
      }
    }
  };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
