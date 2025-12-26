// Use default import; better-sqlite3 exports a callable/constructable function.
// Using namespace import causes 'is not a constructor' at runtime.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
const require = createRequire(import.meta.url);
import { inArray } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import { binPathLog } from '../logger';
import { Env } from '../utils';
import { documents } from './schema';

// We'll dynamically load the sqlite-vec extension (ship prebuilt per-platform binaries)

let db: Database.Database | null = null;
let vecReady = false;

export interface VectorInsertItem {
  id?: string;
  content: string;
  metadata?: any;
  embedding: number[]; // assume float vector
  providerId?: string; // 服务商ID（如 'openai', 'ollama', 'transformers'）
  model?: string; // 模型名称（如 'text-embedding-3-small'）
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getSqliteVecPath(): string | null {
  try {
    // 在开发环境中，直接使用 node_modules
    if (!app.isPackaged) {
      const sqliteVecPath = path.join(process.cwd(), 'node_modules', 'sqlite-vec');
      if (fs.existsSync(sqliteVecPath)) {
        console.log('[vector] Found sqlite-vec in dev mode:', sqliteVecPath);
        return sqliteVecPath;
      }
    }

    // 在打包后的应用中，尝试多个可能的路径
    const possiblePaths = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sqlite-vec'),
      path.join(process.resourcesPath, 'node_modules', 'sqlite-vec'),
      path.join(app.getAppPath(), 'node_modules', 'sqlite-vec')
    ];

    console.log('[vector] Searching for sqlite-vec in packaged app...');
    console.log('[vector] process.resourcesPath:', process.resourcesPath);
    console.log('[vector] app.getAppPath():', app.getAppPath());

    for (const possiblePath of possiblePaths) {
      console.log('[vector] Checking path:', possiblePath);
      if (fs.existsSync(possiblePath)) {
        console.log('[vector] Found sqlite-vec at:', possiblePath);
        return possiblePath;
      }
    }

    console.warn('[vector] sqlite-vec not found in any expected location');
    return null;
  } catch (e) {
    console.warn('[vector] Error finding sqlite-vec path:', e);
    return null;
  }
}

export function getDB(): Database.Database | null {
  if (db) return db;
  const userDir = app.getPath('userData');
  const dbDir = path.join(userDir, 'data');
  ensureDir(dbDir);
  const dbPath = path.join(dbDir, Env.isDev() ? 'app-dev.db' : 'app.db');
  db = new (Database as any)(dbPath);
  // PRAGMA for performance (safe defaults)
  console.log('dbPath', dbPath);
  db!.pragma('journal_mode = WAL');
  db!.pragma('synchronous = NORMAL');
  initSchema();
  // load sqlite-vec (idempotent)
  try {
    console.log('[vector] Attempting to load sqlite-vec extension...');

    // 首先尝试直接 require sqlite-vec（适用于大多数情况）
    try {
      const sqlite_vec = require('sqlite-vec');
      sqlite_vec.load(db as any);
      const versionRow = (db as any).prepare('select vec_version() as v').get();
      if (versionRow?.v) {
        vecReady = true;
        console.log('[vector] sqlite-vec loaded successfully, version:', versionRow.v);
        return db;
      } else {
        console.warn('[vector] sqlite-vec loaded but vec_version() unavailable');
      }
    } catch (requireError: any) {
      console.log('[vector] Direct require failed, trying path-based loading:', requireError?.message || requireError);

      // 如果直接 require 失败，尝试从特定路径加载
      const sqliteVecPath = getSqliteVecPath();
      if (sqliteVecPath) {
        try {
          const sqlite_vec = require(sqliteVecPath);
          sqlite_vec.load(db as any);
          const versionRow = (db as any).prepare('select vec_version() as v').get();
          if (versionRow?.v) {
            vecReady = true;
            console.log('[vector] sqlite-vec loaded from path, version:', versionRow.v);
            return db;
          }
        } catch (pathError: any) {
          console.warn('[vector] Path-based loading also failed:', pathError?.message || pathError);
        }
      }

      // 如果所有方法都失败，抛出原始错误
      throw requireError;
    }
  } catch (e) {
    vecReady = false;
    console.warn('[vector] failed to load sqlite-vec extension (package not installed or binary missing)', e);
  }
  return db;
}

let orm: any = null;

export function getOrm(): any {
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

/**
 * 从所有维度表中删除指定 rowid 的向量数据
 * 这是一个辅助函数，用于在应用层清理多维度表
 */
function deleteFromAllVecTables(rowid: number): void {
  if (!db || !ensureVecLoaded()) return;
  const existingDims = getExistingVecTableDims();
  for (const dim of existingDims) {
    const tableName = getVecTableName(dim);
    try {
      db.prepare(`DELETE FROM ${tableName} WHERE rowid = ?`).run(rowid);
    } catch (e) {
      // 表可能不存在，忽略错误
      console.warn(`[vector] Failed to delete from ${tableName}:`, e);
    }
  }
}

/**
 * 将文档的向量数据插入到对应维度的表中
 * 这是一个辅助函数，用于在应用层恢复多维度索引
 */
function insertIntoVecTableForDim(rowid: number, embedding: Buffer | null, dim: number | null): void {
  if (!db || !ensureVecLoaded() || !embedding || !dim) return;
  const tableName = getVecTableName(dim);
  try {
    ensureVecTableForDim(dim);
    // 先删除旧数据，再插入新数据
    db.prepare(`DELETE FROM ${tableName} WHERE rowid = ?`).run(rowid);
    db.prepare(`INSERT INTO ${tableName}(rowid, embedding) VALUES (?, ?)`).run(rowid, embedding);
  } catch (e) {
    console.warn(`[vector] Failed to insert into ${tableName}:`, e);
  }
}

function setupTriggers(): void {
  if (!db) return;
  try {
    // Documents: soft delete -> remove from all vec tables and upsert recycle_bin
    // 注意：由于 SQLite 触发器限制，我们无法在触发器中动态遍历所有维度表
    // 因此向量表的清理将在应用层的 deleteVectors 函数中处理
    // 这里只处理 recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_documents_soft_delete
AFTER UPDATE OF deleted_at ON documents
WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at != NEW.deleted_at)
BEGIN
  INSERT INTO recycle_bin (id, entity_type, entity_id, title, summary, reason, deleted_at, deleted_by, payload, expire_at)
  VALUES ('doc:' || NEW.id, 'document', NEW.id, COALESCE(NEW.title, substr(NEW.content,1,80)), substr(NEW.content,1,160), 'soft-delete', NEW.deleted_at, 'trigger', NULL, NULL)
  ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at, title=excluded.title, summary=excluded.summary;
END;`);

    // Documents: restore -> reinsert into vec table from stored embedding, remove recycle_bin
    // 注意：向量表的恢复需要在应用层处理，因为需要知道 embedDim
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_documents_restore
AFTER UPDATE OF deleted_at ON documents
WHEN NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL
BEGIN
  DELETE FROM recycle_bin WHERE entity_type='document' AND entity_id=NEW.id;
END;`);

    // Documents: hard delete -> cleanup recycle_bin
    // 注意：向量表的清理在应用层的 deleteVectors 中处理
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_documents_delete
AFTER DELETE ON documents
BEGIN
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

    // Conversations: soft delete -> upsert recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_conversations_soft_delete
AFTER UPDATE OF deleted_at ON conversations
WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at != NEW.deleted_at)
BEGIN
  INSERT INTO recycle_bin (id, entity_type, entity_id, title, summary, reason, deleted_at, deleted_by, payload, expire_at)
  VALUES (
    'conv:' || NEW.id,
    'conversation',
    NEW.id,
    COALESCE(
      NEW.title,
      (SELECT substr(content, 1, 80) FROM chat_messages WHERE conversation_id = NEW.id AND role = 'user' ORDER BY seq LIMIT 1)
    ),
    (SELECT substr(content, 1, 160) FROM chat_messages WHERE conversation_id = NEW.id ORDER BY seq DESC LIMIT 1),
    'soft-delete',
    NEW.deleted_at,
    'trigger',
    NULL,
    NULL
  )
  ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at, title=excluded.title, summary=excluded.summary;
END;`);

    // Conversations: restore -> remove recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_conversations_restore
AFTER UPDATE OF deleted_at ON conversations
WHEN NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL
BEGIN
  DELETE FROM recycle_bin WHERE entity_type='conversation' AND entity_id=NEW.id;
END;`);

    // Conversations: hard delete -> cleanup recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_conversations_delete
AFTER DELETE ON conversations
BEGIN
  DELETE FROM recycle_bin WHERE entity_type='conversation' AND entity_id=OLD.id;
END;`);

    // Folders: soft delete -> upsert recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_folders_soft_delete
AFTER UPDATE OF deleted_at ON folders
WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at != NEW.deleted_at)
BEGIN
  INSERT INTO recycle_bin (id, entity_type, entity_id, title, summary, reason, deleted_at, deleted_by, payload, expire_at)
  VALUES ('folder:' || NEW.id, 'folder', NEW.id, NEW.name, COALESCE(NEW.description, NULL), 'soft-delete', NEW.deleted_at, 'trigger', NULL, NULL)
  ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at, title=excluded.title, summary=excluded.summary;
END;`);

    // Folders: restore -> remove recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_folders_restore
AFTER UPDATE OF deleted_at ON folders
WHEN NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL
BEGIN
  DELETE FROM recycle_bin WHERE entity_type='folder' AND entity_id=NEW.id;
END;`);

    // Folders: hard delete -> cleanup recycle_bin
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_folders_delete
AFTER DELETE ON folders
BEGIN
  DELETE FROM recycle_bin WHERE entity_type='folder' AND entity_id=OLD.id;
END;`);
  } catch (e) {
    console.warn('[db] setupTriggers failed', e);
  }
}

/**
 * 迁移旧的 vec_docs 表到新的按维度分表结构
 * 如果存在旧的 vec_docs 表，尝试从 documents 表重建索引到新的维度表
 */
function migrateOldVecTable(): void {
  if (!db || !ensureVecLoaded()) return;
  try {
    // 检查是否存在旧的 vec_docs 表
    const oldTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='vec_docs'`).get() as { name: string } | undefined;
    if (!oldTable) {
      // 没有旧表，无需迁移
      return;
    }

    console.log('[vector] Found old vec_docs table, starting migration to dimension-based tables...');

    // 从 documents 表中获取所有有 embedding 的文档及其维度
    const docsWithEmbedding = db.prepare(`SELECT id, embed_dim as embedDim FROM documents WHERE embedding IS NOT NULL AND embed_dim IS NOT NULL AND deleted_at IS NULL`).all() as {
      id: string;
      embedDim: number;
    }[];

    if (docsWithEmbedding.length === 0) {
      console.log('[vector] No documents with embeddings found, dropping old vec_docs table');
      db.exec(`DROP TABLE IF EXISTS vec_docs`);
      return;
    }

    // 按维度分组
    const docsByDim = new Map<number, string[]>();
    for (const doc of docsWithEmbedding) {
      if (!docsByDim.has(doc.embedDim)) {
        docsByDim.set(doc.embedDim, []);
      }
      docsByDim.get(doc.embedDim)!.push(doc.id);
    }

    // 为每个维度重建索引
    let migratedCount = 0;
    for (const [dim, ids] of docsByDim.entries()) {
      try {
        ensureVecTableForDim(dim);
        const result = rebuildVectors(ids, dim);
        migratedCount += result.restored;
        console.log(`[vector] Migrated ${result.restored} vectors to vec_docs_${dim}`);
      } catch (e) {
        console.warn(`[vector] Failed to migrate vectors for dimension ${dim}:`, e);
      }
    }

    // 删除旧的 vec_docs 表
    try {
      db.exec(`DROP TABLE IF EXISTS vec_docs`);
      console.log(`[vector] Migration completed: ${migratedCount} vectors migrated, old vec_docs table dropped`);
    } catch (e) {
      console.warn('[vector] Failed to drop old vec_docs table:', e);
    }
  } catch (e) {
    console.warn('[vector] Migration from old vec_docs table failed:', e);
  }
}

function initSchema(): void {
  if (!db) return;
  try {
    const d = getOrm();

    // 在开发环境中使用项目根目录的 drizzle 文件夹
    // 在打包后的应用中，使用 resources/drizzle 文件夹
    let migrationsFolder: string;

    if (app.isPackaged) {
      // 打包后的应用，drizzle 文件夹在 resources 目录下
      migrationsFolder = path.join(process.resourcesPath, 'drizzle');
    } else {
      // 开发环境，使用项目根目录
      migrationsFolder = path.resolve(process.cwd(), 'drizzle');
    }

    binPathLog(migrationsFolder, 'migrationsFolder');

    migrate(d, { migrationsFolder });
    console.log('[db] migrations applied from', migrationsFolder);
  } catch (e) {
    console.warn('[db] failed to run migrations. Ensure you ran "pnpm run db:generate" or "pnpm run db:push" to create ./drizzle', e);
  }
  // vec_docs_* tables are managed by sqlite-vec extension; created lazily per dimension
  // Each dimension has its own virtual table (e.g., vec_docs_384, vec_docs_768)
  // This allows multiple embedding dimensions to coexist in the same database
  setupTriggers();
  // 迁移旧的 vec_docs 表（如果存在）
  migrateOldVecTable();
}

/**
 * 获取指定维度对应的虚拟表名
 * 使用维度作为表名后缀，支持多维度并存
 */
function getVecTableName(dim: number): string {
  return `vec_docs_${dim}`;
}

/**
 * 确保指定维度的虚拟表存在
 * 每个维度使用独立的虚拟表，支持多维度并存
 */
function ensureVecTableForDim(dim: number): void {
  if (!db) return;
  if (!ensureVecLoaded()) {
    console.warn('[vector] sqlite-vec not ready, skip creating vec table');
    return;
  }
  const tableName = getVecTableName(dim);
  // 检查表是否已存在
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tableName);
  if (!row) {
    try {
      db.exec(`CREATE VIRTUAL TABLE ${tableName} USING vec0(embedding float[${dim}]);`);
      console.log(`[vector] Created virtual table ${tableName} with dimension ${dim}`);
    } catch (e) {
      console.error(`[vector] failed to create ${tableName} table (vec0 not available)`, e);
    }
  }
}

/**
 * 获取所有已存在的向量表维度列表
 */
function getExistingVecTableDims(): number[] {
  if (!db) return [];
  try {
    const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'vec_docs_%'`).all() as { name: string }[];
    return rows
      .map((r) => {
        const match = r.name.match(/^vec_docs_(\d+)$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((dim): dim is number => dim !== null)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function float32ArrayToBuffer(arr: number[]): any {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function bufferToFloat32Array(buf: any, dim: number): number[] {
  const out: number[] = new Array(dim);
  for (let i = 0; i < dim; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

function fitToDimLocal(vec: number[], targetDim: number): number[] {
  if (!Array.isArray(vec)) return new Array(targetDim).fill(0);
  if (vec.length === targetDim) return vec;
  if (vec.length > targetDim) return vec.slice(0, targetDim);
  const out = new Array(targetDim);
  for (let i = 0; i < targetDim; i++) out[i] = i < vec.length ? vec[i] : 0;
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

export function insertVectors(items: VectorInsertItem[], dim: number): { inserted: number } {
  const database = getDB();
  ensureVecTableForDim(dim);
  if (!database || !ensureVecLoaded()) {
    console.warn('[vector] insertVectors: database or vec extension not ready');
    return { inserted: 0 };
  }
  const d = getOrm();
  const tableName = getVecTableName(dim);
  // 获取所有已存在的维度表，用于清理旧数据
  const existingDims = getExistingVecTableDims();
  // Statements for vector index maintenance - 使用维度特定的表名
  const delVecById = database.prepare(`DELETE FROM ${tableName} WHERE rowid = (SELECT rowid FROM documents WHERE id=@id)`);
  const insertVec = database!.prepare(`INSERT INTO ${tableName}(rowid, embedding) VALUES((SELECT rowid FROM documents WHERE id=@id), @embedding)`);
  // 为每个维度表创建删除语句（用于清理旧维度的数据）
  const delFromOtherDims = existingDims
    .filter((d) => d !== dim)
    .map((otherDim) => {
      const otherTableName = getVecTableName(otherDim);
      return database.prepare(`DELETE FROM ${otherTableName} WHERE rowid = (SELECT rowid FROM documents WHERE id=@id)`);
    });
  let insertedCount = 0;
  const tx = database!.transaction((rows: VectorInsertItem[]) => {
    for (const r of rows) {
      try {
        const id = r.id || crypto.randomUUID();
        // 验证 embedding 维度
        if (!Array.isArray(r.embedding)) {
          console.warn(`[vector] insertVectors: invalid embedding for id ${id}, skipping`);
          continue;
        }
        const fitted = fitToDimLocal(r.embedding, dim);
        const embBuf = float32ArrayToBuffer(fitted);
        const now = Date.now();
        // Upsert into documents via Drizzle ORM
        d.insert(documents)
          .values({
            id,
            content: r.content,
            metadata: r.metadata ? JSON.stringify(r.metadata) : null,
            embedding: embBuf,
            embedModel: r.model || null,
            embedProviderId: r.providerId || null,
            embedDim: dim,
            embedAt: now,
            workspaceId: r.metadata?.workspaceId || null,
            updatedAt: now
          })
          .onConflictDoUpdate({
            target: documents.id,
            set: {
              content: r.content,
              metadata: r.metadata ? JSON.stringify(r.metadata) : null,
              embedding: embBuf,
              embedModel: r.model || null,
              embedProviderId: r.providerId || null,
              embedDim: dim,
              embedAt: now,
              workspaceId: r.metadata?.workspaceId || null,
              updatedAt: now
            }
          })
          .run?.();
        // 从所有其他维度表中删除旧数据（如果文档之前使用其他维度）
        for (const delStmt of delFromOtherDims) {
          try {
            delStmt.run({ id });
          } catch (e) {
            // 表可能不存在，忽略错误
            console.warn(`[vector] Failed to delete from other dim table:`, e);
          }
        }
        // 删除当前维度表中的旧数据（如果存在），然后插入新数据
        delVecById.run({ id });
        insertVec.run({ id, embedding: embBuf });
        insertedCount++;
      } catch (e) {
        console.error(`[vector] insertVectors: failed to insert item ${r.id || 'unknown'}:`, e);
        // 继续处理其他项
      }
    }
  });
  try {
    tx(items);
    console.log(`[vector] insertVectors: inserted ${insertedCount}/${items.length} items into ${tableName}`);
  } catch (e) {
    console.error('[vector] insertVectors: transaction failed:', e);
    return { inserted: 0 };
  }
  return { inserted: insertedCount };
}

export interface VectorSearchResult {
  id: string;
  content: string;
  metadata: any;
  score: number;
  embedding?: number[];
}

export interface VectorSearchOptions {
  providerId?: string; // 只搜索指定服务商的向量（可选）
  model?: string; // 只搜索指定模型的向量（可选）
}

export function searchVectors(queryEmbedding: number[], k: number, dim: number, options?: VectorSearchOptions): VectorSearchResult[] {
  const database = getDB();
  ensureVecTableForDim(dim);
  if (!database || !ensureVecLoaded()) {
    console.warn('[vector] searchVectors: database or vec extension not ready');
    return [];
  }
  const tableName = getVecTableName(dim);
  try {
    // 验证查询向量的维度
    if (!Array.isArray(queryEmbedding)) {
      console.warn('[vector] searchVectors: invalid query embedding, expected array');
      return [];
    }
    const queryBuf = float32ArrayToBuffer(fitToDimLocal(queryEmbedding, dim));

    // 构建 WHERE 条件：只搜索相同服务商和模型的向量
    const conditions: string[] = ['d.deleted_at IS NULL'];
    const params: any[] = [];

    if (options?.providerId) {
      conditions.push('d.embed_provider_id = ?');
      params.push(options.providerId);
    }
    if (options?.model) {
      conditions.push('d.embed_model = ?');
      params.push(options.model);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Add k = ? constraint for sqlite-vec KNN queries - 使用维度特定的表名
    const stmt = database.prepare(
      `SELECT d.id, d.content, d.metadata, v.distance AS distance, d.embed_provider_id as providerId, d.embed_model as model
       FROM ${tableName} v
       JOIN documents d ON d.rowid = v.rowid
       ${whereClause}
         AND v.embedding MATCH ? AND k = ?
       ORDER BY v.distance
       LIMIT ?`
    );
    const rows = stmt.all(...params, queryBuf, k, k) as any[];
    const results = rows.map((r) => ({
      id: r.id,
      content: r.content,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      score: typeof r.distance === 'number' ? r.distance : 0
    }));
    console.log(`[vector] searchVectors: found ${results.length} results from ${tableName} (dim=${dim}, k=${k}, providerId=${options?.providerId || 'any'}, model=${options?.model || 'any'})`);
    return results;
  } catch (e) {
    console.error(`[vector] searchVectors: failed to search in ${tableName}:`, e);
    return [];
  }
}

export function deleteVectors(ids: string[]): { deleted: number } {
  if (!ids || ids.length === 0) return { deleted: 0 };
  const database = getDB();
  if (!database || !ensureVecLoaded()) return { deleted: 0 };
  // Fetch rowids first to delete from vec table (rowid isn't in schema, use raw SQL)
  const selectRowids = database.prepare(`SELECT rowid FROM documents WHERE id IN (${ids.map(() => '?').join(',')})`);
  const rows = selectRowids.all(...ids) as { rowid: number }[];
  if (rows.length === 0) return { deleted: 0 };
  const rowIds = rows.map((r) => r.rowid);
  const d = getOrm();
  const tx = database.transaction(() => {
    // 从所有维度表中删除（因为一个文档可能在不同维度表中都有数据）
    const existingDims = getExistingVecTableDims();
    for (const dim of existingDims) {
      const tableName = getVecTableName(dim);
      try {
        const delVec = database.prepare(`DELETE FROM ${tableName} WHERE rowid IN (${rowIds.map(() => '?').join(',')})`);
        delVec.run(...rowIds);
      } catch (e) {
        // 表可能不存在，忽略错误
        console.warn(`[vector] Failed to delete from ${tableName}:`, e);
      }
    }
    // Delete from documents via Drizzle ORM
    d.delete(documents).where(inArray(documents.id, ids)).run?.();
  });
  tx();
  return { deleted: rows.length };
}

/**
 * 重建指定文档的向量索引（根据文档的 embedDim 自动选择对应的维度表）
 * 如果文档没有 embedDim，则跳过
 */
export function rebuildVectorsAuto(ids: string[]): { restored: number } {
  const database = getDB();
  if (!database || !ensureVecLoaded()) return { restored: 0 };
  const d = getOrm();
  let totalRestored = 0;
  const tx = database.transaction((idsInner: string[]) => {
    for (const id of idsInner) {
      // 使用原始 SQL 查询文档的 embedDim 和 rowid
      const doc = database.prepare(`SELECT embed_dim as embedDim, rowid FROM documents WHERE id = ? AND embedding IS NOT NULL AND embed_dim IS NOT NULL`).get(id) as
        | { embedDim: number; rowid: number }
        | undefined;
      if (!doc || !doc.embedDim) continue;
      const dim = doc.embedDim;
      const tableName = getVecTableName(dim);
      ensureVecTableForDim(dim);
      // 删除旧数据，然后从 documents 表重新插入
      try {
        database.prepare(`DELETE FROM ${tableName} WHERE rowid = ?`).run(doc.rowid);
        database
          .prepare(
            `INSERT INTO ${tableName}(rowid, embedding)
             SELECT rowid, embedding FROM documents WHERE id = ? AND embedding IS NOT NULL AND embed_dim = ?`
          )
          .run(id, dim);
        totalRestored++;
      } catch (e) {
        console.warn(`[vector] Failed to rebuild vector for ${id} with dim ${dim}:`, e);
      }
    }
  });
  tx(ids);
  return { restored: totalRestored };
}

/**
 * 重建指定维度的向量索引（显式指定维度）
 */
export function rebuildVectors(ids: string[], dim: number): { restored: number } {
  const database = getDB();
  ensureVecTableForDim(dim);
  if (!database || !ensureVecLoaded()) return { restored: 0 };
  const tableName = getVecTableName(dim);
  // Re-insert into dimension-specific vec table from documents table using rowid & stored embedding
  // 只重建指定维度且 embedDim 匹配的文档
  const delVec = database.prepare(`DELETE FROM ${tableName} WHERE rowid = (SELECT rowid FROM documents WHERE id=?)`);
  const insertFromDoc = database.prepare(
    `INSERT INTO ${tableName}(rowid, embedding)
     SELECT rowid, embedding FROM documents WHERE id = ? AND embedding IS NOT NULL AND embed_dim = ?`
  );
  const tx = database.transaction((idsInner: string[]) => {
    for (const id of idsInner) {
      delVec.run(id);
      insertFromDoc.run(id, dim);
    }
  });
  tx(ids);
  return { restored: ids.length };
}

/**
 * 查找不符合指定服务商和模型的文档（需要重新向量化）
 */
export interface DocumentNeedingReembedding {
  id: string;
  content: string;
  metadata: any;
  currentProviderId: string | null;
  currentModel: string | null;
  currentDim: number | null;
}

export function findDocumentsNeedingReembedding(targetProviderId: string, targetModel: string, targetDim?: number): DocumentNeedingReembedding[] {
  const database = getDB();
  if (!database) return [];

  try {
    // 构建查询条件：找出不符合目标服务商和模型的文档
    const conditions: string[] = [
      'embedding IS NOT NULL', // 有 embedding
      'deleted_at IS NULL', // 未删除
      '(embed_provider_id IS NULL OR embed_provider_id != ? OR embed_model IS NULL OR embed_model != ?)' // 服务商或模型不匹配
    ];
    const params: any[] = [targetProviderId, targetModel];

    if (targetDim !== undefined) {
      conditions.push('(embed_dim IS NULL OR embed_dim != ?)');
      params.push(targetDim);
    }

    const whereClause = conditions.join(' AND ');

    const docs = database
      .prepare(
        `SELECT id, content, metadata, embed_provider_id as currentProviderId, embed_model as currentModel, embed_dim as currentDim
         FROM documents
         WHERE ${whereClause}
         ORDER BY embed_at DESC`
      )
      .all(...params) as Array<{
        id: string;
        content: string;
        metadata: string | null;
        currentProviderId: string | null;
        currentModel: string | null;
        currentDim: number | null;
      }>;

    return docs.map((doc) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
      currentProviderId: doc.currentProviderId,
      currentModel: doc.currentModel,
      currentDim: doc.currentDim
    }));
  } catch (e) {
    console.error('[vector] findDocumentsNeedingReembedding: failed', e);
    return [];
  }
}

/**
 * 重新向量化指定文档（使用新的服务商和模型）
 */
export async function reembedDocuments(
  ids: string[],
  providerId: string,
  model: string,
  dim: number,
  embedFn: (texts: string[]) => Promise<number[][]>
): Promise<{ reembedded: number; failed: number }> {
  const database = getDB();
  if (!database || !ensureVecLoaded()) return { reembedded: 0, failed: 0 };

  // 获取需要重新向量化的文档内容
  const placeholders = ids.map(() => '?').join(',');
  const docs = database.prepare(`SELECT id, content, metadata FROM documents WHERE id IN (${placeholders}) AND deleted_at IS NULL`).all(...ids) as Array<{
    id: string;
    content: string;
    metadata: string | null;
  }>;

  if (docs.length === 0) {
    console.warn('[vector] reembedDocuments: no documents found');
    return { reembedded: 0, failed: 0 };
  }

  let reembedded = 0;
  let failed = 0;

  try {
    // 批量生成新的 embedding
    const texts = docs.map((d) => d.content);
    const embeddings = await embedFn(texts);

    if (embeddings.length !== docs.length) {
      console.error(`[vector] reembedDocuments: embedding count mismatch (expected ${docs.length}, got ${embeddings.length})`);
      return { reembedded: 0, failed: docs.length };
    }

    // 准备插入数据
    const items: VectorInsertItem[] = docs.map((doc, idx) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata ? JSON.parse(doc.metadata) : null,
      embedding: embeddings[idx],
      providerId,
      model
    }));

    // 批量插入新的向量
    const result = insertVectors(items, dim);
    reembedded = result.inserted;
    failed = docs.length - result.inserted;

    console.log(`[vector] reembedDocuments: reembedded ${reembedded}/${docs.length} documents with ${providerId}:${model} (dim=${dim})`);
  } catch (e) {
    console.error('[vector] reembedDocuments: failed', e);
    failed = docs.length;
  }

  return { reembedded, failed };
}

export * as Schema from './schema';
