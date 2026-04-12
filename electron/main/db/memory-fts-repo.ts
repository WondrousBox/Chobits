import fs from 'node:fs';
import path from 'node:path';

import { eq, isNull } from 'drizzle-orm';

import { parseFrontmatter, readLines } from '../../../packages/ai/services/memory-note-parser';
import { getDB, getOrm } from '.';
import { MEMORY_FTS_CREATE_SQL, MEMORY_FTS_TABLE_NAME } from './memory-fts';
import { memory_notes, memory_sections, type MemoryNoteRow, type MemorySectionRow } from './schema';

export const MemoryFTSRepo = {
  insertNoteEntry(noteId: string, data: { title: string; summary: string; keywords: string; aliases: string; entities: string; body: string }): void {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb
      .prepare(
        `INSERT INTO ${MEMORY_FTS_TABLE_NAME}(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
         VALUES (?, 'note', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(noteId, noteId, data.title, data.summary, data.keywords, data.aliases, data.entities, data.body);
  },

  insertSectionEntry(sectionId: string, noteId: string, data: { title: string; summary: string; keywords: string; aliases: string; entities: string; body: string }): void {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb
      .prepare(
        `INSERT INTO ${MEMORY_FTS_TABLE_NAME}(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
         VALUES (?, 'section', ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(sectionId, noteId, data.title, data.summary, data.keywords, data.aliases, data.entities, data.body);
  },

  deleteByNote(noteId: string): void {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb.prepare(`DELETE FROM ${MEMORY_FTS_TABLE_NAME} WHERE note_id = ?`).run(noteId);
  },

  recreateTable(): void {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb.exec(`DROP TABLE IF EXISTS ${MEMORY_FTS_TABLE_NAME}`);
    rawDb.exec(MEMORY_FTS_CREATE_SQL);
  },

  rebuildForNote(
    noteId: string,
    noteData: { title: string; summary: string; keywords: string; aliases: string; entities: string; body: string },
    sections: Array<{
      id: string;
      title: string;
      summary: string;
      keywords: string;
      aliases: string;
      entities: string;
      body: string;
    }>
  ): void {
    const rawDb = getDB();
    if (!rawDb) return;

    const deleteStmt = rawDb.prepare(`DELETE FROM ${MEMORY_FTS_TABLE_NAME} WHERE note_id = ?`);
    const insertNoteStmt = rawDb.prepare(
      `INSERT INTO ${MEMORY_FTS_TABLE_NAME}(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
       VALUES (?, 'note', ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertSectionStmt = rawDb.prepare(
      `INSERT INTO ${MEMORY_FTS_TABLE_NAME}(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
       VALUES (?, 'section', ?, ?, ?, ?, ?, ?, ?)`
    );

    rawDb.transaction(() => {
      deleteStmt.run(noteId);
      insertNoteStmt.run(noteId, noteId, noteData.title, noteData.summary, noteData.keywords, noteData.aliases, noteData.entities, noteData.body);
      for (const section of sections) {
        insertSectionStmt.run(section.id, noteId, section.title, section.summary, section.keywords, section.aliases, section.entities, section.body);
      }
    })();
  },

  search(
    query: string,
    opts: { entryType?: 'note' | 'section'; noteIds?: string[]; limit?: number } = {}
  ): Array<{
    entry_id: string;
    entry_type: string;
    note_id: string;
    rank: number;
  }> {
    const rawDb = getDB();
    if (!rawDb) return [];

    const limit = opts.limit ?? 20;
    let sql = `SELECT entry_id, entry_type, note_id, rank
               FROM ${MEMORY_FTS_TABLE_NAME}
               WHERE ${MEMORY_FTS_TABLE_NAME} MATCH ?`;
    const params: any[] = [query];

    if (opts.entryType) {
      sql += ' AND entry_type = ?';
      params.push(opts.entryType);
    }
    if (opts.noteIds?.length) {
      const placeholders = opts.noteIds.map(() => '?').join(',');
      sql += ` AND note_id IN (${placeholders})`;
      params.push(...opts.noteIds);
    }
    sql += ' ORDER BY rank LIMIT ?';
    params.push(limit);

    try {
      return rawDb.prepare(sql).all(...params) as any[];
    } catch (error) {
      console.warn('[MemoryFTS] search failed:', error);
      return [];
    }
  },

  truncate(): void {
    const rawDb = getDB();
    if (!rawDb) return;
    rawDb.prepare(`DELETE FROM ${MEMORY_FTS_TABLE_NAME}`).run();
  },

  async rebuildAll(): Promise<number> {
    const rawDb = getDB();
    if (!rawDb) return 0;
    const orm = getOrm();

    this.truncate();

    const notes = await orm.select().from(memory_notes).where(isNull(memory_notes.deletedAt));
    let count = 0;

    for (const note of notes as MemoryNoteRow[]) {
      const topics = safeJsonParse(note.topics, []);
      const keywords = safeJsonParse(note.keywords, []);
      const aliases = safeJsonParse(note.aliases, []);
      const entities = safeJsonParse(note.entities, []);
      const sections = await orm.select().from(memory_sections).where(eq(memory_sections.noteId, note.id)).orderBy(memory_sections.sectionOrder);
      const { noteBody, sectionBodies } = loadIndexedBodies(rawDb, note, sections as MemorySectionRow[]);

      this.insertNoteEntry(note.id, {
        title: topics.join(' '),
        summary: note.summary || '',
        keywords: keywords.join(' '),
        aliases: aliases.join(' '),
        entities: entities.map((entity: any) => entity?.name || entity).join(' '),
        body: noteBody
      });

      for (const section of sections as MemorySectionRow[]) {
        const sectionKeywords = safeJsonParse(section.keywords, []);
        this.insertSectionEntry(section.id, note.id, {
          title: section.heading,
          summary: section.summary || '',
          keywords: sectionKeywords.join(' '),
          aliases: '',
          entities: '',
          body: sectionBodies.get(section.id) || section.summary || ''
        });
      }

      count++;
    }

    return count;
  }
};

function safeJsonParse(json: string | null | undefined, fallback: any[] = []): any[] {
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadIndexedBodies(rawDb: ReturnType<typeof getDB>, note: MemoryNoteRow, sections: MemorySectionRow[]): { noteBody: string; sectionBodies: Map<string, string> } {
  const sectionBodies = new Map<string, string>();

  if (!rawDb || !note.filePath || !note.workspaceId) {
    return { noteBody: note.summary || '', sectionBodies };
  }

  const workspace = rawDb.prepare('SELECT root_path FROM workspaces WHERE id = ? LIMIT 1').get(note.workspaceId) as { root_path?: string } | undefined;
  if (!workspace?.root_path) {
    return { noteBody: note.summary || '', sectionBodies };
  }

  try {
    const absolutePath = path.join(workspace.root_path, note.filePath);
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const { bodyStartLine } = parseFrontmatter(content);
    const lines = content.split('\n');
    const noteBody =
      lines
        .slice(Math.max(0, bodyStartLine - 1))
        .join('\n')
        .trim() ||
      note.summary ||
      '';

    for (const section of sections) {
      const body = readLines(content, section.lineStart, section.lineEnd).trim();
      if (body) {
        sectionBodies.set(section.id, body);
      }
    }

    return { noteBody, sectionBodies };
  } catch {
    return { noteBody: note.summary || '', sectionBodies };
  }
}
