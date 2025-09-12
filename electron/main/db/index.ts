// Use default import; better-sqlite3 exports a callable/constructable function.
// Using namespace import causes 'is not a constructor' at runtime.
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// We'll dynamically load the sqlite-vec extension (ship prebuilt per-platform binaries)

let db: Database.Database | null = null;
let vecReady = false;

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
  // load sqlite-vec (idempotent)
  try {
    const sqlite_vec = require('sqlite-vec');
    sqlite_vec.load(db as any);
    const versionRow = (db as any).prepare('select vec_version() as v').get();
    if (versionRow?.v) {
      vecReady = true;
      console.log('[vector] sqlite-vec version', versionRow.v);
    } else {
      console.warn('[vector] sqlite-vec loaded but vec_version() unavailable');
    }
  } catch (e) {
    vecReady = false;
    console.warn('[vector] failed to load sqlite-vec extension (package not installed or binary missing)', e);
  }
  return db;
}

function ensureVecLoaded(): boolean {
  if (!db) return false;
  if (!vecReady) return false;
  try {
    const r = (db as any).prepare('select vec_version() as v').get();
    return !!r?.v;
  } catch {
    return false;
  }
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
  // NOTE: sqlite-vec typical usage: CREATE VIRTUAL TABLE vec_docs USING vec0(embedding float[1536]);
  // We'll create lazily via ensureVecTable(dim) when first vector op occurs.
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

// Ensure sqlite-vec extension table exists for given dimension
function ensureVecTable(dim: number) {
  if (!db) return;
  if (!ensureVecLoaded()) {
    console.warn('[vector] sqlite-vec not ready, skip creating vec_docs');
    return;
  }
  // quick check
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='vec_docs'`).get();
  if (!row) {
    try {
      db.exec(`CREATE VIRTUAL TABLE vec_docs USING vec0(embedding float[${dim}]);`);
    } catch (e) {
      console.error('[vector] failed to create vec_docs table (vec0 not available)', e);
    }
  }
}

export function insertVectors(items: VectorInsertItem[], dim: number) {
  const database = getDB();
  ensureVecTable(dim);
  if (!database || !ensureVecLoaded()) return { inserted: 0 };
  const insertDoc = database!.prepare(`INSERT OR REPLACE INTO documents(id, content, metadata, embedding) VALUES(@id, @content, @metadata, @embedding)`);
  // vector32(@embedding) -> @embedding
  const insertVec = database!.prepare(`INSERT OR REPLACE INTO vec_docs(rowid, embedding) VALUES((SELECT rowid FROM documents WHERE id=@id), @embedding)`);
  const tx = database!.transaction((rows: VectorInsertItem[]) => {
    for (const r of rows) {
      const id = r.id || crypto.randomUUID();
      const embBuf = float32ArrayToBuffer(r.embedding);
      insertDoc.run({
        id,
        content: r.content,
        metadata: r.metadata ? JSON.stringify(r.metadata) : null,
        embedding: embBuf
      });
      insertVec.run({ id, embedding: embBuf });
    }
  });
  tx(items);
  return { inserted: items.length };
}

export interface VectorSearchResult { id: string; content: string; metadata: any; score: number; embedding?: number[] }

export function searchVectors(queryEmbedding: number[], k: number, dim: number): VectorSearchResult[] {
  const database = getDB();
  ensureVecTable(dim);
  if (!database || !ensureVecLoaded()) return [];
  const queryBuf = float32ArrayToBuffer(queryEmbedding);
  // Add k = ? constraint for sqlite-vec KNN queries
  const stmt = database.prepare(
    `SELECT d.id, d.content, d.metadata, v.distance AS distance
     FROM vec_docs v
     JOIN documents d ON d.rowid = v.rowid
     WHERE v.embedding MATCH ? AND k = ?
     ORDER BY v.distance
     LIMIT ?`
  );
  const rows = stmt.all(queryBuf, k, k) as any[];
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
  if (!database || !ensureVecLoaded()) return { deleted: 0 };
  // Fetch rowids first to delete from vec table.
  const selectRowids = database.prepare(`SELECT rowid FROM documents WHERE id IN (${ids.map(() => '?').join(',')})`);
  const rows = selectRowids.all(...ids) as { rowid: number }[];
  if (rows.length === 0) return { deleted: 0 };
  const rowIds = rows.map(r => r.rowid);
  const delVec = database.prepare(`DELETE FROM vec_docs WHERE rowid IN (${rowIds.map(() => '?').join(',')})`);
  const delDoc = database.prepare(`DELETE FROM documents WHERE id IN (${ids.map(() => '?').join(',')})`);
  const tx = database.transaction(() => {
    delVec.run(...rowIds);
    delDoc.run(...ids);
  });
  tx();
  return { deleted: rows.length };
}
