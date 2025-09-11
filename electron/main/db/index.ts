// Use default import; better-sqlite3 exports a callable/constructable function.
// Using namespace import causes 'is not a constructor' at runtime.
import Database from 'better-sqlite3';
import * as sqlite_vss from 'sqlite-vss';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

// We'll dynamically load the sqlite-vss extension (must ship the compiled .node/.dylib)
// Placeholder path (user to provide compiled sqlite-vss library). For now this is optional.

let db: Database.Database | null = null;

export interface VectorInsertItem {
  id?: string;
  content: string;
  metadata?: any;
  embedding: number[]; // assume float vector
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function getDB() {
  if (db) return db;
  const userDir = app.getPath('userData');
  const dbDir = path.join(userDir, 'data');
  ensureDir(dbDir);
  const dbPath = path.join(dbDir, 'app.db');
  db = new (Database as any)(dbPath);
  // PRAGMA for performance (safe defaults)
  console.log("dbPath", dbPath);
  db!.pragma('journal_mode = WAL');
  db!.pragma('synchronous = NORMAL');
  initSchema();
  // load sqlite-vss (idempotent)
  try {
    sqlite_vss.load(db as any);
    const version = (db as any).prepare('select vss_version() as v').get()?.v;
    console.log('[vector] sqlite-vss version', version);
  } catch (e) {
    console.warn('[vector] failed to load sqlite-vss extension', e);
  }
  return db;
}

function initSchema() {
  if (!db) return;
  // Base tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      metadata TEXT,
      embedding BLOB -- store as binary float32 array
    );
    CREATE TABLE IF NOT EXISTS meta_kv (
      k TEXT PRIMARY KEY,
      v TEXT
    );
  `);
  // NOTE: sqlite-vss typical usage: CREATE VIRTUAL TABLE vss_docs USING vss0(embedding(1536));
  // We'll create lazily via ensureVssTable(dim) when first vector op occurs.
}

function float32ArrayToBuffer(arr: number[]): Buffer {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

function bufferToFloat32Array(buf: Buffer, dim: number): number[] {
  const out: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

// Ensure sqlite-vss extension table exists for given dimension
function ensureVssTable(dim: number) {
  if (!db) return;
  // quick check
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='vss_docs'`).get();
  if (!row) {
    db.exec(`CREATE VIRTUAL TABLE vss_docs USING vss0(embedding(${dim}));`);
  }
}

export function insertVectors(items: VectorInsertItem[], dim: number) {
  const database = getDB();
  ensureVssTable(dim);
  if (!database) return { inserted: 0 };
  const insertDoc = database!.prepare(`INSERT OR REPLACE INTO documents(id, content, metadata, embedding) VALUES(@id, @content, @metadata, @embedding)`);
  const insertVss = database!.prepare(`INSERT OR REPLACE INTO vss_docs(rowid, embedding) VALUES((SELECT rowid FROM documents WHERE id=@id), @embedding)`);
  const tx = database!.transaction((rows: VectorInsertItem[]) => {
    for (const r of rows) {
      const id = r.id || crypto.randomUUID();
      insertDoc.run({
        id,
        content: r.content,
        metadata: r.metadata ? JSON.stringify(r.metadata) : null,
        embedding: float32ArrayToBuffer(r.embedding)
      });
      insertVss.run({ id, embedding: float32ArrayToBuffer(r.embedding) });
    }
  });
  tx(items);
  return { inserted: items.length };
}

export interface VectorSearchResult { id: string; content: string; metadata: any; score: number; embedding?: number[] }

export function searchVectors(queryEmbedding: number[], k: number, dim: number): VectorSearchResult[] {
  const database = getDB();
  ensureVssTable(dim);
  if (!database) return [];
  const queryBuf = float32ArrayToBuffer(queryEmbedding);
  // Temporary table for single query vector
  database.exec('CREATE TEMP TABLE IF NOT EXISTS _q (id INTEGER PRIMARY KEY, embedding BLOB);');
  const upQ = database.prepare('INSERT OR REPLACE INTO _q(id, embedding) VALUES(1, ?)');
  upQ.run(queryBuf);
  // Use documented pattern: where vss_search(column, vss_search_params(query_vector, limit))
  const stmt = database.prepare(
    `SELECT d.id, d.content, d.metadata, v.distance AS distance
     FROM vss_docs v
     JOIN documents d ON d.rowid = v.rowid
     WHERE vss_search(v.embedding, vss_search_params((SELECT embedding FROM _q WHERE id=1), ?));`
  );
  const rows = stmt.all(k) as any[];
  return rows.map(r => ({
    id: r.id,
    content: r.content,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    score: typeof r.distance === 'number' ? r.distance : 0
  }));
}

export function deleteVectors(ids: string[]): { deleted: number } {
  if (!ids || ids.length === 0) return { deleted: 0 };
  const database = getDB();
  if (!database) return { deleted: 0 };
  // Fetch rowids first to delete from vss table.
  const selectRowids = database.prepare(`SELECT rowid FROM documents WHERE id IN (${ids.map(() => '?').join(',')})`);
  const rows = selectRowids.all(...ids) as { rowid: number }[];
  if (rows.length === 0) return { deleted: 0 };
  const rowIds = rows.map(r => r.rowid);
  const delVss = database.prepare(`DELETE FROM vss_docs WHERE rowid IN (${rowIds.map(() => '?').join(',')})`);
  const delDoc = database.prepare(`DELETE FROM documents WHERE id IN (${ids.map(() => '?').join(',')})`);
  const tx = database.transaction(() => {
    delVss.run(...rowIds);
    delDoc.run(...ids);
  });
  tx();
  return { deleted: rows.length };
}
