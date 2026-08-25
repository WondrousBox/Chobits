import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type FtsEntry = {
  entry_id: string;
  entry_type: 'note' | 'section';
  note_id: string;
  title: string;
  summary: string;
  keywords: string;
  aliases: string;
  entities: string;
  body: string;
};

const ftsState = vi.hoisted(() => ({
  db: null as ReturnType<typeof createFakeDb> | null
}));

vi.mock('../../electron/main/db', () => ({
  getDB: () => ftsState.db,
  getOrm: () => {
    throw new Error('getOrm should not be used in row-update FTS tests');
  }
}));

import { MemoryFTSRepo } from '../../electron/main/db/memory-fts-repo';
import { isLegacyContentlessMemoryFtsSql, MEMORY_FTS_CREATE_SQL } from '../../electron/main/db/memory-fts';

function createFakeDb() {
  const entries: FtsEntry[] = [];
  const execCalls: string[] = [];
  const preparedSql: string[] = [];

  return {
    entries,
    execCalls,
    preparedSql,
    prepare(sql: string) {
      preparedSql.push(sql);

      return {
        run: (...args: any[]) => {
          if (sql.startsWith('DELETE FROM memory_notes_fts WHERE note_id = ?')) {
            const [noteId] = args as [string];
            for (let i = entries.length - 1; i >= 0; i--) {
              if (entries[i].note_id === noteId) {
                entries.splice(i, 1);
              }
            }
            return;
          }

          if (sql.startsWith('DELETE FROM memory_notes_fts')) {
            entries.splice(0, entries.length);
            return;
          }

          if (sql.includes("VALUES (?, 'note'")) {
            const [entryId, noteId, title, summary, keywords, aliases, entitiesValue, body] = args;
            entries.push({
              entry_id: entryId,
              entry_type: 'note',
              note_id: noteId,
              title,
              summary,
              keywords,
              aliases,
              entities: entitiesValue,
              body
            });
            return;
          }

          if (sql.includes("VALUES (?, 'section'")) {
            const [entryId, noteId, title, summary, keywords, aliases, entitiesValue, body] = args;
            entries.push({
              entry_id: entryId,
              entry_type: 'section',
              note_id: noteId,
              title,
              summary,
              keywords,
              aliases,
              entities: entitiesValue,
              body
            });
            return;
          }

          throw new Error(`Unhandled run SQL: ${sql}`);
        },
        all: (...args: any[]) => {
          if (sql.startsWith('SELECT entry_id, entry_type, note_id, rank')) {
            const [query, maybeEntryType] = args as [string, 'note' | 'section' | number | undefined];
            const terms = String(query)
              .replace(/"/g, '')
              .split(/\s+OR\s+/)
              .map((term) => term.trim().toLowerCase())
              .filter(Boolean);

            return entries
              .filter((entry) => (maybeEntryType === 'note' || maybeEntryType === 'section' ? entry.entry_type === maybeEntryType : true))
              .filter((entry) =>
                terms.some((term) =>
                  [entry.title, entry.summary, entry.keywords, entry.body]
                    .join(' ')
                    .toLowerCase()
                    .includes(term)
                )
              )
              .map((entry, index) => ({
                entry_id: entry.entry_id,
                entry_type: entry.entry_type,
                note_id: entry.note_id,
                rank: index + 1
              }));
          }

          throw new Error(`Unhandled all SQL: ${sql}`);
        }
      };
    },
    exec(sql: string) {
      execCalls.push(sql);
    },
    transaction<T extends (...args: any[]) => any>(callback: T) {
      return (...args: Parameters<T>) => callback(...args);
    }
  };
}

describe('memory FTS repo incremental maintenance', () => {
  beforeEach(() => {
    ftsState.db = createFakeDb();
  });

  afterEach(() => {
    ftsState.db = null;
  });

  it('uses a row-mutable FTS schema and still detects the legacy contentless definition', () => {
    expect(MEMORY_FTS_CREATE_SQL).not.toContain("content=''");
    expect(
      isLegacyContentlessMemoryFtsSql(`
        CREATE VIRTUAL TABLE memory_notes_fts USING fts5(
          entry_id,
          body,
          content='',
          tokenize='unicode61'
        )
      `)
    ).toBe(true);
    expect(isLegacyContentlessMemoryFtsSql(MEMORY_FTS_CREATE_SQL)).toBe(false);
  });

  it('deletes only the targeted note rows', () => {
    const db = ftsState.db!;

    MemoryFTSRepo.insertNoteEntry('note-1', {
      title: 'runtime memory',
      summary: 'first summary',
      keywords: 'runtime memory',
      aliases: '',
      entities: '',
      body: 'first body'
    });
    MemoryFTSRepo.insertSectionEntry('note-1-sec', 'note-1', {
      title: 'Key Points',
      summary: 'first section',
      keywords: 'runtime',
      aliases: '',
      entities: '',
      body: 'first section body'
    });
    MemoryFTSRepo.insertNoteEntry('note-2', {
      title: 'cleanup memory',
      summary: 'second summary',
      keywords: 'cleanup',
      aliases: '',
      entities: '',
      body: 'second body'
    });

    MemoryFTSRepo.deleteByNote('note-1');

    expect(db.entries.map((entry) => entry.note_id)).toEqual(['note-2']);
    expect(db.execCalls).toEqual([]);
  });

  it('rebuilds a single note without disturbing other note entries or recreating the table', () => {
    const db = ftsState.db!;

    MemoryFTSRepo.insertNoteEntry('note-1', {
      title: 'runtime memory',
      summary: 'old summary',
      keywords: 'runtime',
      aliases: '',
      entities: '',
      body: 'old body'
    });
    MemoryFTSRepo.insertSectionEntry('note-1-old', 'note-1', {
      title: 'Key Points',
      summary: 'old section',
      keywords: 'runtime',
      aliases: '',
      entities: '',
      body: 'old section body'
    });
    MemoryFTSRepo.insertNoteEntry('note-2', {
      title: 'cleanup memory',
      summary: 'other summary',
      keywords: 'cleanup',
      aliases: '',
      entities: '',
      body: 'other body'
    });

    const rebuildSections = [
      {
        id: 'note-1-sec-a',
        title: 'Key Points',
        summary: 'updated key points',
        keywords: 'runtime',
        aliases: '',
        entities: '',
        body: 'updated key points body'
      },
      {
        id: 'note-1-sec-b',
        title: 'Open Items',
        summary: 'updated open items',
        keywords: 'config',
        aliases: '',
        entities: '',
        body: 'updated open items body'
      }
    ];

    MemoryFTSRepo.rebuildForNote(
      'note-1',
      {
        title: 'runtime memory',
        summary: 'updated summary',
        keywords: 'runtime config',
        aliases: '',
        entities: '',
        body: 'updated body'
      },
      rebuildSections
    );

    MemoryFTSRepo.rebuildForNote(
      'note-1',
      {
        title: 'runtime memory',
        summary: 'updated summary',
        keywords: 'runtime config',
        aliases: '',
        entities: '',
        body: 'updated body'
      },
      rebuildSections
    );

    expect(db.entries.filter((entry) => entry.note_id === 'note-1')).toHaveLength(3);
    expect(db.entries.filter((entry) => entry.note_id === 'note-2')).toHaveLength(1);
    expect(db.execCalls).toEqual([]);

    const noteHits = MemoryFTSRepo.search('"updated"', { entryType: 'note', limit: 10 });
    expect(noteHits.map((hit) => hit.note_id)).toEqual(['note-1']);
  });
});
