export const MEMORY_FTS_TABLE_NAME = 'memory_notes_fts';

export const MEMORY_FTS_CREATE_SQL = `
  CREATE VIRTUAL TABLE IF NOT EXISTS ${MEMORY_FTS_TABLE_NAME} USING fts5(
    entry_id,
    entry_type,
    note_id,
    title,
    summary,
    keywords,
    aliases,
    entities,
    body,
    tokenize='unicode61 remove_diacritics 2'
  );
`;

export function isLegacyContentlessMemoryFtsSql(sql: string | null | undefined): boolean {
  return typeof sql === 'string' && /content\s*=\s*''/i.test(sql);
}
