import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { parseFrontmatter, parseSections, readLines } from '../../../../packages/ai/services/memory-note-parser';
import { buildSectionId } from '../../../../packages/ai/services/memory-note-writer';
import type { MemoryNoteFrontmatter, MemoryNoteSectionIndex } from '../../../../packages/ai/services/memory-types';
import { getDB } from '../../db';
import { MEMORY_FTS_TABLE_NAME } from '../../db/memory-fts';
import { MemoryNoteRepo, MemorySectionRepo } from '../../db/memory-repositories';
import { WorkspacesRepo } from '../../db/repositories';

export type MemoryIndexAuditIssueKind =
  | 'workspace_root_missing'
  | 'markdown_read_failed'
  | 'frontmatter_missing'
  | 'frontmatter_id_missing'
  | 'duplicate_markdown_note_id'
  | 'db_note_missing'
  | 'db_extra_note'
  | 'note_field_mismatch'
  | 'section_missing'
  | 'section_extra'
  | 'section_field_mismatch'
  | 'fts_unavailable'
  | 'fts_missing_note_row'
  | 'fts_missing_section_row'
  | 'fts_extra_row'
  | 'fts_entry_count_mismatch';

export interface MemoryIndexAuditIssue {
  kind: MemoryIndexAuditIssueKind;
  message: string;
  noteId?: string;
  filePath?: string;
  field?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface MemoryIndexAuditReport {
  ok: boolean;
  workspaceId: string;
  workspaceRoot: string | null;
  scannedFiles: number;
  parsedNotes: number;
  dbNotes: number;
  ftsCheckedNotes: number;
  issueCount: number;
  issueLimit: number;
  issueLimitReached: boolean;
  summary: {
    markdownIssues: number;
    noteIssues: number;
    sectionIssues: number;
    ftsIssues: number;
  };
  issues: MemoryIndexAuditIssue[];
}

interface ParsedMarkdownNote {
  noteId: string;
  filePath: string;
  content: string;
  frontmatter: MemoryNoteFrontmatter;
  sections: MemoryNoteSectionIndex[];
  fileChecksum: string;
}

interface ExpectedSectionSnapshot {
  id: string;
  heading: string;
  headingLevel: number;
  sectionOrder: number;
  summary: string;
  keywords: string[];
  lineStart: number;
  lineEnd: number;
  charCount: number;
}

const DEFAULT_ISSUE_LIMIT = 200;

export async function validateMemoryIndex(
  workspaceId: string,
  options: {
    issueLimit?: number;
  } = {}
): Promise<MemoryIndexAuditReport> {
  const issueLimit = Math.max(1, options.issueLimit ?? DEFAULT_ISSUE_LIMIT);
  const issues: MemoryIndexAuditIssue[] = [];
  let issueLimitReached = false;
  let markdownIssues = 0;
  let noteIssues = 0;
  let sectionIssues = 0;
  let ftsIssues = 0;
  let scannedFiles = 0;
  let parsedNotes = 0;
  let ftsCheckedNotes = 0;

  const pushIssue = (issue: MemoryIndexAuditIssue): void => {
    if (issue.kind === 'markdown_read_failed' || issue.kind === 'frontmatter_missing' || issue.kind === 'frontmatter_id_missing' || issue.kind === 'duplicate_markdown_note_id') {
      markdownIssues++;
    } else if (issue.kind === 'db_note_missing' || issue.kind === 'db_extra_note' || issue.kind === 'note_field_mismatch' || issue.kind === 'workspace_root_missing') {
      noteIssues++;
    } else if (issue.kind === 'section_missing' || issue.kind === 'section_extra' || issue.kind === 'section_field_mismatch') {
      sectionIssues++;
    } else {
      ftsIssues++;
    }

    if (issues.length < issueLimit) {
      issues.push(issue);
    } else {
      issueLimitReached = true;
    }
  };

  const workspace = await WorkspacesRepo.getById(workspaceId);
  if (!workspace?.rootPath) {
    pushIssue({
      kind: 'workspace_root_missing',
      message: `Workspace "${workspaceId}" has no root path`
    });
    return {
      ok: false,
      workspaceId,
      workspaceRoot: workspace?.rootPath ?? null,
      scannedFiles,
      parsedNotes,
      dbNotes: 0,
      ftsCheckedNotes,
      issueCount: markdownIssues + noteIssues + sectionIssues + ftsIssues,
      issueLimit,
      issueLimitReached,
      summary: {
        markdownIssues,
        noteIssues,
        sectionIssues,
        ftsIssues
      },
      issues
    };
  }

  const workspaceRoot = workspace.rootPath;
  const notesRoot = path.join(workspaceRoot, 'memory', 'daily');
  const noteFiles = await listMarkdownNoteFiles(notesRoot, workspaceRoot);
  scannedFiles = noteFiles.length;

  const parsedMarkdownNotes = new Map<string, ParsedMarkdownNote>();

  for (const filePath of noteFiles) {
    const absolutePath = path.join(workspaceRoot, filePath);

    let content: string;
    try {
      content = await fs.readFile(absolutePath, 'utf-8');
    } catch (error) {
      pushIssue({
        kind: 'markdown_read_failed',
        filePath,
        message: `Failed to read Markdown note: ${filePath}`,
        actual: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    const { frontmatter } = parseFrontmatter(content);
    if (!frontmatter) {
      pushIssue({
        kind: 'frontmatter_missing',
        filePath,
        message: `Markdown note is missing valid frontmatter: ${filePath}`
      });
      continue;
    }

    if (!frontmatter.id?.trim()) {
      pushIssue({
        kind: 'frontmatter_id_missing',
        filePath,
        message: `Markdown note frontmatter is missing id: ${filePath}`
      });
      continue;
    }

    const noteId = frontmatter.id.trim();
    if (parsedMarkdownNotes.has(noteId)) {
      pushIssue({
        kind: 'duplicate_markdown_note_id',
        noteId,
        filePath,
        message: `Duplicate Markdown note id "${noteId}" detected`
      });
      continue;
    }

    const sections = parseSections(content, noteId);
    const fileChecksum = createHash('sha256').update(content, 'utf-8').digest('hex');
    parsedMarkdownNotes.set(noteId, {
      noteId,
      filePath,
      content,
      frontmatter,
      sections,
      fileChecksum
    });
    parsedNotes++;
  }

  const dbNotes = await listAllNotesByWorkspace(workspaceId);
  const dbNotesById = new Map(dbNotes.map((note) => [note.id, note]));

  for (const parsed of parsedMarkdownNotes.values()) {
    const dbNote = dbNotesById.get(parsed.noteId);
    if (!dbNote) {
      pushIssue({
        kind: 'db_note_missing',
        noteId: parsed.noteId,
        filePath: parsed.filePath,
        message: `Markdown note "${parsed.noteId}" is missing from memory_notes`
      });
      continue;
    }

    compareNoteSnapshot(parsed, dbNote, workspaceId, pushIssue);
    await compareSections(parsed, pushIssue);
    compareFtsEntries(parsed, pushIssue);
    ftsCheckedNotes++;
  }

  for (const dbNote of dbNotes) {
    if (parsedMarkdownNotes.has(dbNote.id)) continue;
    pushIssue({
      kind: 'db_extra_note',
      noteId: dbNote.id,
      filePath: normalizeSlashes(dbNote.filePath),
      message: `DB note "${dbNote.id}" has no matching Markdown source`,
      actual: {
        filePath: normalizeSlashes(dbNote.filePath),
        workspaceId: dbNote.workspaceId
      }
    });
  }

  return {
    ok: issues.length === 0 && !issueLimitReached,
    workspaceId,
    workspaceRoot,
    scannedFiles,
    parsedNotes,
    dbNotes: dbNotes.length,
    ftsCheckedNotes,
    issueCount: markdownIssues + noteIssues + sectionIssues + ftsIssues,
    issueLimit,
    issueLimitReached,
    summary: {
      markdownIssues,
      noteIssues,
      sectionIssues,
      ftsIssues
    },
    issues
  };
}

async function compareSections(parsed: ParsedMarkdownNote, pushIssue: (issue: MemoryIndexAuditIssue) => void): Promise<void> {
  const actualSections = await MemorySectionRepo.listByNote(parsed.noteId);
  const actualById = new Map(actualSections.map((section) => [section.id, section]));
  const expectedSections = buildExpectedSections(parsed);

  for (const expected of expectedSections) {
    const actual = actualById.get(expected.id);
    if (!actual) {
      pushIssue({
        kind: 'section_missing',
        noteId: parsed.noteId,
        filePath: parsed.filePath,
        field: expected.heading,
        message: `Section "${expected.heading}" is missing from memory_sections`
      });
      continue;
    }

    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.id',
      expected: expected.id,
      actual: actual.id,
      message: `Section id mismatch for "${expected.heading}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.heading',
      expected: expected.heading,
      actual: actual.heading,
      message: `Section heading mismatch for "${expected.id}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.headingLevel',
      expected: expected.headingLevel,
      actual: actual.headingLevel,
      message: `Section headingLevel mismatch for "${expected.heading}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.sectionOrder',
      expected: expected.sectionOrder,
      actual: actual.sectionOrder,
      message: `Section order mismatch for "${expected.heading}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.summary',
      expected: expected.summary,
      actual: actual.summary ?? '',
      message: `Section summary mismatch for "${expected.heading}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.keywords',
      expected: expected.keywords,
      actual: safeJsonParse(actual.keywords, []),
      message: `Section keywords mismatch for "${expected.heading}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.lineStart',
      expected: expected.lineStart,
      actual: actual.lineStart,
      message: `Section lineStart mismatch for "${expected.heading}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.lineEnd',
      expected: expected.lineEnd,
      actual: actual.lineEnd,
      message: `Section lineEnd mismatch for "${expected.heading}"`
    });
    compareField(pushIssue, {
      kind: 'section_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'section.charCount',
      expected: expected.charCount,
      actual: actual.charCount,
      message: `Section charCount mismatch for "${expected.heading}"`
    });
  }

  for (const actual of actualSections) {
    if (expectedSections.some((section) => section.id === actual.id)) continue;
    pushIssue({
      kind: 'section_extra',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: actual.heading,
      message: `DB contains extra section "${actual.heading}" not present in Markdown`
    });
  }
}

function compareFtsEntries(parsed: ParsedMarkdownNote, pushIssue: (issue: MemoryIndexAuditIssue) => void): void {
  const rawDb = getDB();
  if (!rawDb) {
    pushIssue({
      kind: 'fts_unavailable',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      message: 'Raw DB is unavailable; cannot validate memory_notes_fts'
    });
    return;
  }

  const rows = rawDb.prepare(`SELECT entry_id, entry_type, note_id FROM ${MEMORY_FTS_TABLE_NAME} WHERE note_id = ? ORDER BY entry_type, entry_id`).all(parsed.noteId) as Array<{
    entry_id: string;
    entry_type: string;
    note_id: string;
  }>;

  const expectedEntryIds = [parsed.noteId, ...buildExpectedSections(parsed).map((section) => section.id)];
  const actualEntryIds = rows.map((row) => row.entry_id);

  if (!actualEntryIds.includes(parsed.noteId)) {
    pushIssue({
      kind: 'fts_missing_note_row',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      message: `FTS is missing note row for "${parsed.noteId}"`
    });
  }

  for (const sectionId of expectedEntryIds.slice(1)) {
    if (actualEntryIds.includes(sectionId)) continue;
    pushIssue({
      kind: 'fts_missing_section_row',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: sectionId,
      message: `FTS is missing section row "${sectionId}"`
    });
  }

  for (const actualEntryId of actualEntryIds) {
    if (expectedEntryIds.includes(actualEntryId)) continue;
    pushIssue({
      kind: 'fts_extra_row',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: actualEntryId,
      message: `FTS contains extra row "${actualEntryId}" not derivable from Markdown`
    });
  }

  if (actualEntryIds.length !== expectedEntryIds.length) {
    pushIssue({
      kind: 'fts_entry_count_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      expected: expectedEntryIds.length,
      actual: actualEntryIds.length,
      message: `FTS entry count mismatch for "${parsed.noteId}"`
    });
  }
}

function compareNoteSnapshot(parsed: ParsedMarkdownNote, actual: any, workspaceId: string, pushIssue: (issue: MemoryIndexAuditIssue) => void): void {
  const fm = parsed.frontmatter;
  const expectedFields = [
    ['workspaceId', fm.workspaceId, actual.workspaceId],
    ['date', fm.date, actual.date],
    ['version', fm.version, actual.version],
    ['timeRange.start', fm.timeRange?.start ?? null, actual.timeRangeStart ?? null],
    ['timeRange.end', fm.timeRange?.end ?? null, actual.timeRangeEnd ?? null],
    ['filePath', parsed.filePath, normalizeSlashes(actual.filePath)],
    ['fileChecksum', parsed.fileChecksum, actual.fileChecksum ?? null],
    ['topics', fm.topics ?? [], safeJsonParse(actual.topics, [])],
    ['parentTopicId', fm.parentTopicId ?? null, actual.parentTopicId ?? null],
    ['relatedTopicIds', fm.relatedTopicIds ?? [], safeJsonParse(actual.relatedTopicIds, [])],
    ['domain', fm.domain ?? null, actual.domain ?? null],
    ['keywords', fm.keywords ?? [], safeJsonParse(actual.keywords, [])],
    ['aliases', fm.aliases ?? [], safeJsonParse(actual.aliases, [])],
    ['entities', fm.entities ?? [], safeJsonParse(actual.entities, [])],
    ['summary', fm.summary, actual.summary ?? ''],
    ['sourceConversationIds', fm.sourceConversationIds ?? [], safeJsonParse(actual.sourceConversationIds, [])],
    ['sourceMessageRange', fm.sourceMessageRange ?? [], safeJsonParse(actual.sourceMessageRange, [])],
    ['importance', fm.importance, actual.importance],
    ['stability', fm.stability, actual.stability],
    ['createdAt', fm.createdAt, actual.createdAt],
    ['updatedAt', fm.updatedAt, actual.updatedAt],
    ['sectionCount', parsed.sections.length, actual.sectionCount],
    ['charCount', parsed.content.length, actual.charCount],
    ['tokenEstimate', Math.round(parsed.content.length / 2.5), actual.tokenEstimate]
  ] as const;

  for (const [field, expected, actualValue] of expectedFields) {
    compareField(pushIssue, {
      kind: 'note_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field,
      expected,
      actual: actualValue,
      message: `Note field mismatch for "${parsed.noteId}" on ${field}`
    });
  }

  if (actual.workspaceId !== workspaceId) {
    compareField(pushIssue, {
      kind: 'note_field_mismatch',
      noteId: parsed.noteId,
      filePath: parsed.filePath,
      field: 'workspaceId',
      expected: workspaceId,
      actual: actual.workspaceId,
      message: `Workspace mismatch for "${parsed.noteId}"`
    });
  }
}

function compareField(pushIssue: (issue: MemoryIndexAuditIssue) => void, issue: Omit<MemoryIndexAuditIssue, 'message'> & { message: string }): void {
  if (valuesEqual(issue.expected, issue.actual)) return;
  pushIssue(issue);
}

function buildExpectedSections(parsed: ParsedMarkdownNote): ExpectedSectionSnapshot[] {
  const noteKeywords = parsed.frontmatter.keywords ?? [];
  return parsed.sections.map((section, index) => {
    const body = section.lineEnd > section.lineStart ? readLines(parsed.content, section.lineStart + 1, section.lineEnd) : '';
    const lowerBody = body.toLowerCase();
    const matchedKeywords = noteKeywords.filter((keyword) => lowerBody.includes(keyword.toLowerCase()));
    return {
      id: buildSectionId(parsed.noteId, section.heading),
      heading: section.heading,
      headingLevel: section.headingLevel,
      sectionOrder: index,
      summary: section.summary || '',
      keywords: matchedKeywords,
      lineStart: section.lineStart,
      lineEnd: section.lineEnd,
      charCount: section.charCount
    };
  });
}

async function listAllNotesByWorkspace(workspaceId: string): Promise<any[]> {
  const notes: any[] = [];
  const pageSize = 200;
  let offset = 0;

  while (true) {
    const batch = await MemoryNoteRepo.listByWorkspace(workspaceId, pageSize, offset);
    notes.push(...batch);
    if (batch.length < pageSize) break;
    offset += batch.length;
  }

  return notes;
}

async function listMarkdownNoteFiles(root: string, workspaceRoot: string): Promise<string[]> {
  try {
    const stat = await fs.stat(root);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listMarkdownNoteFiles(absolutePath, workspaceRoot)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith('.md')) continue;
    if (entry.name.endsWith('.index.md')) continue;
    results.push(normalizeSlashes(path.relative(workspaceRoot, absolutePath)));
  }

  return results.sort();
}

function safeJsonParse(value: string | null | undefined, fallback: any): any {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function normalizeSlashes(filePath: string | null | undefined): string {
  return (filePath ?? '').replace(/\\/g, '/');
}
