import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const auditState = vi.hoisted(() => ({
  workspaceRoot: '',
  dbNotes: [] as any[],
  dbSectionsByNoteId: new Map<string, any[]>(),
  ftsRowsByNoteId: new Map<string, Array<{ entry_id: string; entry_type: string; note_id: string }>>()
}));

vi.mock('../electron/main/db', () => ({
  getDB: () => ({
    prepare: (sql: string) => ({
      all: (noteId: string) => {
        if (sql.includes('FROM memory_notes_fts WHERE note_id = ?')) {
          return auditState.ftsRowsByNoteId.get(noteId) ?? [];
        }
        throw new Error(`Unhandled SQL: ${sql}`);
      }
    })
  })
}));

vi.mock('../electron/main/db/memory-repositories', () => ({
  MemoryNoteRepo: {
    listByWorkspace: vi.fn(async (_workspaceId: string, limit = 200, offset = 0) => auditState.dbNotes.slice(offset, offset + limit))
  },
  MemorySectionRepo: {
    listByNote: vi.fn(async (noteId: string) => auditState.dbSectionsByNoteId.get(noteId) ?? [])
  }
}));

vi.mock('../electron/main/db/repositories', () => ({
  WorkspacesRepo: {
    getById: vi.fn(async () => (auditState.workspaceRoot ? { id: 'ws-1', rootPath: auditState.workspaceRoot } : null))
  }
}));

import { validateMemoryIndex } from '../electron/main/handlers/memory/memory-index-audit';
import { buildSectionId, renderNoteMarkdown } from '../packages/ai/services/memory-note-writer';
import { parseSections } from '../packages/ai/services/memory-note-parser';
import type { MergedNote } from '../packages/ai/services/memory-types';

afterEach(async () => {
  if (auditState.workspaceRoot) {
    await fs.rm(auditState.workspaceRoot, { recursive: true, force: true });
  }
  auditState.workspaceRoot = '';
  auditState.dbNotes = [];
  auditState.dbSectionsByNoteId.clear();
  auditState.ftsRowsByNoteId.clear();
});

describe('memory index audit', () => {
  it('passes when Markdown, DB sections, and FTS rows are aligned', async () => {
    const { note, filePath, content, checksum, sections } = await createFixtureNote();
    const noteId = note.noteId;

    auditState.dbNotes = [
      {
        id: noteId,
        workspaceId: 'ws-1',
        date: note.frontmatter.date,
        version: note.frontmatter.version,
        timeRangeStart: note.frontmatter.timeRange?.start ?? null,
        timeRangeEnd: note.frontmatter.timeRange?.end ?? null,
        filePath,
        fileChecksum: checksum,
        topics: JSON.stringify(note.frontmatter.topics),
        parentTopicId: note.frontmatter.parentTopicId ?? null,
        relatedTopicIds: JSON.stringify(note.frontmatter.relatedTopicIds ?? []),
        domain: note.frontmatter.domain ?? null,
        keywords: JSON.stringify(note.frontmatter.keywords),
        aliases: JSON.stringify(note.frontmatter.aliases ?? []),
        entities: JSON.stringify(note.frontmatter.entities ?? []),
        summary: note.frontmatter.summary,
        sourceConversationIds: JSON.stringify(note.frontmatter.sourceConversationIds),
        sourceMessageRange: JSON.stringify(note.frontmatter.sourceMessageRange ?? []),
        importance: note.frontmatter.importance,
        stability: note.frontmatter.stability,
        createdAt: note.frontmatter.createdAt,
        updatedAt: note.frontmatter.updatedAt,
        sectionCount: sections.length,
        charCount: content.length,
        tokenEstimate: Math.round(content.length / 2.5)
      }
    ];

    auditState.dbSectionsByNoteId.set(noteId, buildDbSections(note, content, sections));
    auditState.ftsRowsByNoteId.set(noteId, [
      { entry_id: noteId, entry_type: 'note', note_id: noteId },
      ...sections.map((section) => ({
        entry_id: buildSectionId(noteId, section.heading),
        entry_type: 'section',
        note_id: noteId
      }))
    ]);

    const report = await validateMemoryIndex('ws-1');

    expect(report.ok).toBe(true);
    expect(report.issueCount).toBe(0);
    expect(report.scannedFiles).toBe(1);
    expect(report.parsedNotes).toBe(1);
    expect(report.dbNotes).toBe(1);
    expect(report.summary).toEqual({
      markdownIssues: 0,
      noteIssues: 0,
      sectionIssues: 0,
      ftsIssues: 0
    });
  });

  it('reports note and FTS drift reconstructed from Markdown', async () => {
    const { note, filePath, content, sections } = await createFixtureNote();
    const noteId = note.noteId;

    auditState.dbNotes = [
      {
        id: noteId,
        workspaceId: 'ws-1',
        date: note.frontmatter.date,
        version: note.frontmatter.version,
        timeRangeStart: note.frontmatter.timeRange?.start ?? null,
        timeRangeEnd: note.frontmatter.timeRange?.end ?? null,
        filePath,
        fileChecksum: 'stale-checksum',
        topics: JSON.stringify(note.frontmatter.topics),
        parentTopicId: note.frontmatter.parentTopicId ?? null,
        relatedTopicIds: JSON.stringify(note.frontmatter.relatedTopicIds ?? []),
        domain: note.frontmatter.domain ?? null,
        keywords: JSON.stringify(note.frontmatter.keywords),
        aliases: JSON.stringify(note.frontmatter.aliases ?? []),
        entities: JSON.stringify(note.frontmatter.entities ?? []),
        summary: 'stale summary',
        sourceConversationIds: JSON.stringify(note.frontmatter.sourceConversationIds),
        sourceMessageRange: JSON.stringify(note.frontmatter.sourceMessageRange ?? []),
        importance: note.frontmatter.importance,
        stability: note.frontmatter.stability,
        createdAt: note.frontmatter.createdAt,
        updatedAt: note.frontmatter.updatedAt,
        sectionCount: sections.length,
        charCount: content.length,
        tokenEstimate: Math.round(content.length / 2.5)
      }
    ];

    auditState.dbSectionsByNoteId.set(noteId, buildDbSections(note, content, sections));
    auditState.ftsRowsByNoteId.set(noteId, [{ entry_id: noteId, entry_type: 'note', note_id: noteId }]);

    const report = await validateMemoryIndex('ws-1');

    expect(report.ok).toBe(false);
    expect(report.issueCount).toBeGreaterThan(0);
    expect(report.issues.some((issue) => issue.kind === 'note_field_mismatch' && issue.field === 'fileChecksum')).toBe(true);
    expect(report.issues.some((issue) => issue.kind === 'note_field_mismatch' && issue.field === 'summary')).toBe(true);
    expect(report.issues.some((issue) => issue.kind === 'fts_missing_section_row')).toBe(true);
    expect(report.summary.ftsIssues).toBeGreaterThan(0);
  });
});

async function createFixtureNote(): Promise<{
  note: MergedNote;
  filePath: string;
  content: string;
  checksum: string;
  sections: ReturnType<typeof parseSections>;
}> {
  auditState.workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'chobits-memory-audit-'));

  const note: MergedNote = {
    action: 'create',
    noteId: 'mem_2026-04-12_memory-audit_ab12cd',
    filePath: 'memory/daily/2026/04/2026-04-12-memory-audit.md',
    frontmatter: {
      id: 'mem_2026-04-12_memory-audit_ab12cd',
      version: 2,
      workspaceId: 'ws-1',
      date: '2026-04-12',
      timeRange: { start: 1712880000000, end: 1712883600000 },
      topics: ['Memory Audit'],
      parentTopicId: 'topic_memory',
      relatedTopicIds: ['topic_index', 'topic_fts'],
      domain: 'project:chobits',
      keywords: ['memory', 'audit', 'fts'],
      aliases: ['index audit'],
      entities: [
        {
          name: 'SQLite FTS5',
          type: 'technology'
        }
      ],
      summary: 'Validate that Markdown can reconstruct note, section, and FTS indexes.',
      sourceConversationIds: ['conv-1'],
      sourceMessageRange: [{ conversationId: 'conv-1', seqStart: 1, seqEnd: 10 }],
      importance: 0.88,
      stability: 0.81,
      createdAt: 1712880000000,
      updatedAt: 1712883600000
    },
    sections: new Map([
      ['Key Points', '- Memory audit validates note state\n- FTS rows must match Markdown-derived entries'],
      ['Recall Cues', '- [decision] Markdown remains the fact source for rebuild validation.']
    ])
  };

  const content = renderNoteMarkdown(note);
  const absolutePath = path.join(auditState.workspaceRoot, note.filePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, 'utf-8');

  return {
    note,
    filePath: note.filePath,
    content,
    checksum: createHash('sha256').update(content, 'utf-8').digest('hex'),
    sections: parseSections(content, note.noteId)
  };
}

function buildDbSections(note: MergedNote, content: string, sections: ReturnType<typeof parseSections>): any[] {
  const keywords = note.frontmatter.keywords ?? [];
  return sections.map((section, index) => {
    const body = section.lineEnd > section.lineStart ? content.split('\n').slice(section.lineStart, section.lineEnd).join('\n') : '';
    const matchedKeywords = keywords.filter((keyword) => body.toLowerCase().includes(keyword.toLowerCase()));
    return {
      id: buildSectionId(note.noteId, section.heading),
      noteId: note.noteId,
      heading: section.heading,
      headingLevel: section.headingLevel,
      sectionOrder: index,
      summary: section.summary,
      keywords: matchedKeywords.length ? JSON.stringify(matchedKeywords) : null,
      lineStart: section.lineStart,
      lineEnd: section.lineEnd,
      charCount: section.charCount
    };
  });
}
