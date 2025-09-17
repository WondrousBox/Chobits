// Use default import; better-sqlite3 exports a callable/constructable function.
// Using namespace import causes 'is not a constructor' at runtime.
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { inArray } from 'drizzle-orm';
import { documents } from './schema';

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

let orm: any = null;

export function getOrm() {
  if (orm) return orm;
  const db = getDB() as any;
  orm = drizzle(db);
  return orm;
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

function setupTriggers() {
  if (!db) return;
  try {
    // Documents: soft delete -> remove vec_docs and upsert recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_documents_soft_delete
AFTER UPDATE OF deleted_at ON documents
WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at != NEW.deleted_at)
BEGIN
  DELETE FROM vec_docs WHERE rowid = OLD.rowid;
  INSERT INTO recycle_bin (id, entity_type, entity_id, title, summary, reason, deleted_at, deleted_by, payload, expire_at)
  VALUES ('doc:' || NEW.id, 'document', NEW.id, COALESCE(NEW.title, substr(NEW.content,1,80)), substr(NEW.content,1,160), 'soft-delete', NEW.deleted_at, 'trigger', NULL, NULL)
  ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at, title=excluded.title, summary=excluded.summary;
END;`);

    // Documents: restore -> reinsert vec_docs from stored embedding, remove recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_documents_restore
AFTER UPDATE OF deleted_at ON documents
WHEN NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL
BEGIN
  DELETE FROM vec_docs WHERE rowid = NEW.rowid;
  INSERT INTO vec_docs(rowid, embedding)
    SELECT NEW.rowid, NEW.embedding
    WHERE NEW.embedding IS NOT NULL;
  DELETE FROM recycle_bin WHERE entity_type='document' AND entity_id=NEW.id;
END;`);

    // Documents: hard delete -> cleanup vec_docs & recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_documents_delete
AFTER DELETE ON documents
BEGIN
  DELETE FROM vec_docs WHERE rowid = OLD.rowid;
  DELETE FROM recycle_bin WHERE entity_type='document' AND entity_id=OLD.id;
END;`);

    // Resources: soft delete -> upsert recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_resources_soft_delete
AFTER UPDATE OF deleted_at ON resources
WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at != NEW.deleted_at)
BEGIN
  INSERT INTO recycle_bin (id, entity_type, entity_id, title, summary, reason, deleted_at, deleted_by, payload, expire_at)
  VALUES ('res:' || NEW.id, 'resource', NEW.id, NEW.title, COALESCE(NEW.content_text, NEW.description), 'soft-delete', NEW.deleted_at, 'trigger', NULL, NULL)
  ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at, title=excluded.title, summary=excluded.summary;
END;`);

    // Resources: restore -> remove recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_resources_restore
AFTER UPDATE OF deleted_at ON resources
WHEN NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL
BEGIN
  DELETE FROM recycle_bin WHERE entity_type='resource' AND entity_id=NEW.id;
END;`);

    // Resources: hard delete -> cleanup recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_resources_delete
AFTER DELETE ON resources
BEGIN
  DELETE FROM recycle_bin WHERE entity_type='resource' AND entity_id=OLD.id;
END;`);
  } catch (e) {
    console.warn('[db] setupTriggers failed', e);
  }
}

function initSchema() {
  if (!db) return;
  try {
    const d = getOrm();
    const migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    migrate(d, { migrationsFolder });
    console.log('[db] migrations applied from', migrationsFolder);
  } catch (e) {
    console.warn('[db] failed to run migrations. Ensure you ran "pnpm run db:generate" or "pnpm run db:push" to create ./drizzle', e);
  }
  // vec_docs is managed by sqlite-vec extension; created lazily in ensureVecTable(dim)
  setupTriggers();
}

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

function float32ArrayToBuffer(arr: number[]): any {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

function bufferToFloat32Array(buf: any, dim: number): number[] {
  const out: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

// Ensure sqlite-vec extension table exists for given dimension
// function ensureVecTable(dim: number) {
//   if (!db) return;
//   if (!ensureVecLoaded()) {
//     console.warn('[vector] sqlite-vec not ready, skip creating vec_docs');
//     return;
//   }
//   // quick check
//   const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='vec_docs'`).get();
//   if (!row) {
//     try {
//       db.exec(`CREATE VIRTUAL TABLE vec_docs USING vec0(embedding float[${dim}]);`);
//     } catch (e) {
//       console.error('[vector] failed to create vec_docs table (vec0 not available)', e);
//     }
//   }
// }

export function insertVectors(items: VectorInsertItem[], dim: number) {
  const database = getDB();
  ensureVecTable(dim);
  if (!database || !ensureVecLoaded()) return { inserted: 0 };
  const d = getOrm();
  // Statements for vector index maintenance
  const delVecById = database.prepare(
    `DELETE FROM vec_docs WHERE rowid = (SELECT rowid FROM documents WHERE id=@id)`
  );
  const insertVec = database!.prepare(
    `INSERT INTO vec_docs(rowid, embedding) VALUES((SELECT rowid FROM documents WHERE id=@id), @embedding)`
  );
  const tx = database!.transaction((rows: VectorInsertItem[]) => {
    for (const r of rows) {
      const id = r.id || crypto.randomUUID();
      const embBuf = float32ArrayToBuffer(r.embedding);
      const now = Date.now();
      // Upsert into documents via Drizzle ORM
      d.insert(documents)
        .values({
          id,
          content: r.content,
          metadata: r.metadata ? JSON.stringify(r.metadata) : null,
          embedding: embBuf,
          embedDim: dim,
          embedAt: now,
          workspaceId: r.metadata?.workspaceId || null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            content: r.content,
            metadata: r.metadata ? JSON.stringify(r.metadata) : null,
            embedding: embBuf,
            embedDim: dim,
            embedAt: now,
            workspaceId: r.metadata?.workspaceId || null,
            updatedAt: now,
          },
        })
        .run?.();
      // Ensure vec_docs has a single row per document rowid: delete then insert
      delVecById.run({ id });
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
  // Fetch rowids first to delete from vec table (rowid isn't in schema, use raw SQL)
  const selectRowids = database.prepare(`SELECT rowid FROM documents WHERE id IN (${ids.map(() => '?').join(',')})`);
  const rows = selectRowids.all(...ids) as { rowid: number }[];
  if (rows.length === 0) return { deleted: 0 };
  const rowIds = rows.map(r => r.rowid);
  const delVec = database.prepare(`DELETE FROM vec_docs WHERE rowid IN (${rowIds.map(() => '?').join(',')})`);
  const d = getOrm();
  const tx = database.transaction(() => {
    delVec.run(...rowIds);
    // Delete from documents via Drizzle ORM
    d.delete(documents).where(inArray(documents.id, ids)).run?.();
  });
  tx();
  return { deleted: rows.length };
}

export function rebuildVectors(ids: string[], dim: number): { restored: number } {
  const database = getDB();
  ensureVecTable(dim);
  if (!database || !ensureVecLoaded()) return { restored: 0 };
  // Re-insert into vec_docs from documents table using rowid & stored embedding
  const delVec = database.prepare(`DELETE FROM vec_docs WHERE rowid = (SELECT rowid FROM documents WHERE id=?)`);
  const insertFromDoc = database.prepare(
    `INSERT INTO vec_docs(rowid, embedding)
     SELECT rowid, embedding FROM documents WHERE id = ? AND embedding IS NOT NULL`
  );
  const tx = database.transaction((idsInner: string[]) => {
    for (const id of idsInner) {
      delVec.run(id);
      insertFromDoc.run(id);
    }
  });
  tx(ids);
  return { restored: ids.length };
}

export * as Schema from './schema';
