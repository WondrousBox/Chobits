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

import { parseFrontmatter, readLines } from '../../../packages/ai/services/memory-note-parser';
import { binPathLog } from '../logger';
import { Env } from '../utils';
import { isLegacyContentlessMemoryFtsSql, MEMORY_FTS_CREATE_SQL, MEMORY_FTS_TABLE_NAME } from './memory-fts';
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

    // Resources: soft delete -> upsert recycle_bin (drop old trigger to update payload logic)
    db.exec(`DROP TRIGGER IF EXISTS trg_resources_soft_delete`);
    db.exec(`CREATE TRIGGER IF NOT EXISTS trg_resources_soft_delete
AFTER UPDATE OF deleted_at ON resources
WHEN NEW.deleted_at IS NOT NULL AND (OLD.deleted_at IS NULL OR OLD.deleted_at != NEW.deleted_at)
BEGIN
  INSERT INTO recycle_bin (id, entity_type, entity_id, title, summary, reason, deleted_at, deleted_by, payload, expire_at)
  VALUES ('res:' || NEW.id, 'resource', NEW.id, NEW.title, COALESCE(NEW.content_text, NEW.description), 'soft-delete', NEW.deleted_at, 'trigger', json_object('id', NEW.id, 'originalFilePath', NEW.file_path), NULL)
  ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at, title=excluded.title, summary=excluded.summary, payload=excluded.payload;
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

function repairDuplicateChatMessageSequences(): void {
  if (!db) return;

  try {
    const duplicateGroups = db
      .prepare(
        `SELECT conversation_id AS conversationId, seq, COUNT(*) AS duplicateCount
         FROM chat_messages
         GROUP BY conversation_id, seq
         HAVING COUNT(*) > 1`
      )
      .all() as Array<{ conversationId: string; duplicateCount: number; seq: number }>;

    if (!duplicateGroups.length) {
      return;
    }

    console.warn(
      '[db] Found duplicate chat message seq values, resequencing conversations:',
      duplicateGroups.map((group) => `${group.conversationId}:${group.seq}x${group.duplicateCount}`).join(', ')
    );

    db.exec(`WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY conversation_id
          ORDER BY seq ASC, created_at ASC, rowid ASC
        ) AS next_seq
      FROM chat_messages
    )
    UPDATE chat_messages
    SET seq = (
      SELECT ranked.next_seq
      FROM ranked
      WHERE ranked.id = chat_messages.id
    )
    WHERE id IN (
      SELECT ranked.id
      FROM ranked
      WHERE ranked.next_seq != chat_messages.seq
    );`);
  } catch (error) {
    console.warn('[db] Failed to repair duplicate chat message seq values', error);
  }
}

function ensureChatMessageSequenceIndex(): void {
  if (!db) return;

  repairDuplicateChatMessageSequences();

  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_messages_conv_seq ON chat_messages (conversation_id, seq);`);
  } catch (error) {
    console.warn('[db] Failed to ensure unique chat message sequence index', error);
  }
}

/**
 * 迁移旧的 vec_docs 表到新的按维度分表结构
 * 如果存在旧的 vec_docs 表，尝试从 documents 表重建索引到新的维度表
 */
/**
 * 创建记忆系统 FTS5 虚拟表（contentless 模式）
 * FTS5 虚拟表不在 Drizzle schema 中定义（Drizzle 不支持 FTS5 声明），
 * 通过 raw SQL 在 initSchema 中创建。
 */
function ensureMemoryFTS(): void {
  if (!db) return;
  try {
    const existing = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name = ?`).get(MEMORY_FTS_TABLE_NAME) as { sql?: string | null } | undefined;
    const needsCreate = !existing;
    const needsMigration = isLegacyContentlessMemoryFtsSql(existing?.sql);

    if (needsMigration) {
      db.exec(`DROP TABLE IF EXISTS ${MEMORY_FTS_TABLE_NAME}`);
    }

    if (needsCreate || needsMigration) {
      db.exec(MEMORY_FTS_CREATE_SQL);
      const rebuilt = rebuildMemoryFtsFromDerivedSources();
      const action = needsMigration ? 'migrated' : 'created';
      console.log(`[memory] FTS5 virtual table ${action}${rebuilt > 0 ? ` and rebuilt ${rebuilt} notes` : ''}`);
      return;
    }

    console.log('[memory] FTS5 virtual table ensured');
  } catch (e) {
    console.warn('[memory] Failed to create memory_notes_fts virtual table:', e);
  }
}

function rebuildMemoryFtsFromDerivedSources(): number {
  if (!db) return 0;

  const notes = db.prepare('SELECT * FROM memory_notes WHERE deleted_at IS NULL').all() as Array<{
    id: string;
    summary?: string | null;
    keywords?: string | null;
    aliases?: string | null;
    entities?: string | null;
    topics?: string | null;
    workspace_id?: string | null;
    file_path?: string | null;
  }>;

  if (notes.length === 0) {
    return 0;
  }

  const selectSections = db.prepare('SELECT * FROM memory_sections WHERE note_id = ? ORDER BY section_order');
  const selectWorkspace = db.prepare('SELECT root_path FROM workspaces WHERE id = ? LIMIT 1') as { get: (workspaceId: string) => { root_path?: string | null } | undefined };
  const clearStmt = db.prepare(`DELETE FROM ${MEMORY_FTS_TABLE_NAME}`);
  const insertNoteStmt = db.prepare(
    `INSERT INTO ${MEMORY_FTS_TABLE_NAME}(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
       VALUES (?, 'note', ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSectionStmt = db.prepare(
    `INSERT INTO ${MEMORY_FTS_TABLE_NAME}(entry_id, entry_type, note_id, title, summary, keywords, aliases, entities, body)
       VALUES (?, 'section', ?, ?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    clearStmt.run();

    for (const note of notes) {
      const topics = safeJsonArray(note.topics);
      const keywords = safeJsonArray(note.keywords);
      const aliases = safeJsonArray(note.aliases);
      const entities = safeJsonArray(note.entities);
      const sections = selectSections.all(note.id) as Array<{
        id: string;
        heading: string;
        summary?: string | null;
        keywords?: string | null;
        line_start?: number;
        line_end?: number;
      }>;
      const { noteBody, sectionBodies } = loadMemoryFtsBodies(note, sections, selectWorkspace);

      insertNoteStmt.run(note.id, note.id, topics.join(' '), note.summary || '', keywords.join(' '), aliases.join(' '), entities.map((entity: any) => entity?.name || entity).join(' '), noteBody);

      for (const section of sections) {
        const sectionKeywords = safeJsonArray(section.keywords);
        insertSectionStmt.run(section.id, note.id, section.heading, section.summary || '', sectionKeywords.join(' '), '', '', sectionBodies.get(section.id) || section.summary || '');
      }
    }
  })();

  return notes.length;
}

function loadMemoryFtsBodies(
  note: {
    summary?: string | null;
    workspace_id?: string | null;
    file_path?: string | null;
  },
  sections: Array<{
    id: string;
    summary?: string | null;
    line_start?: number;
    line_end?: number;
  }>,
  selectWorkspace: { get: (workspaceId: string) => { root_path?: string | null } | undefined }
): { noteBody: string; sectionBodies: Map<string, string> } {
  const sectionBodies = new Map<string, string>();

  if (!note.workspace_id || !note.file_path) {
    return { noteBody: note.summary || '', sectionBodies };
  }

  try {
    const workspace = selectWorkspace.get(note.workspace_id);
    if (!workspace?.root_path) {
      return { noteBody: note.summary || '', sectionBodies };
    }

    const absolutePath = path.join(workspace.root_path, note.file_path);
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
      if (!section.line_start || !section.line_end) continue;
      const body = readLines(content, section.line_start, section.line_end).trim();
      if (body) {
        sectionBodies.set(section.id, body);
      }
    }

    return { noteBody, sectionBodies };
  } catch {
    return { noteBody: note.summary || '', sectionBodies };
  }
}

function safeJsonArray(value: string | null | undefined): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

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

/**
 * Pre-migration compatibility fixes.
 *
 * When `pnpm db:push` was used to apply schema changes directly, the
 * corresponding Drizzle migration files may fail because the DDL they
 * contain has already been applied.  We detect these situations and
 * either mark the migration as applied or clean up conflicting objects
 * so that the standard `migrate()` call succeeds.
 *
 * Drizzle's migrate() determines which migrations to apply by comparing
 * the last row's `created_at` in `__drizzle_migrations` against each
 * migration's `folderMillis` (the journal `when` field).  If an earlier
 * compat fix inserted a row with `Date.now()` as `created_at`, this
 * timestamp may exceed later migrations' `folderMillis`, causing them
 * to be permanently skipped.  We detect and clean up such phantom rows.
 */
function preMigrationCompat(): void {
  if (!db) return;

  try {
    db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )`);

    const HASH_0009 = 'e5218191d7af6dc4a542277c5863573c4e946c8eda7ba4d368390e3f0635156e';
    const MILLIS_0009 = 1773487817867;

    const memoryTablesExist = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='memory_topics'`).get();

    // --- Cleanup: remove phantom migration records --------------------------------
    // If memory tables don't exist, migration 0010 was never successfully applied.
    // Delete any __drizzle_migrations rows at/after 0009's timestamp that aren't
    // the correct 0009 record — these are leftovers from buggy previous compat
    // fixes that used Date.now() as created_at, blocking subsequent migrations.
    if (!memoryTablesExist) {
      const suspectRows = db.prepare(`SELECT id, hash, created_at FROM __drizzle_migrations WHERE created_at >= ?`).all(MILLIS_0009) as Array<{ id: number; hash: string; created_at: number }>;

      for (const row of suspectRows) {
        if (row.hash === HASH_0009 && row.created_at === MILLIS_0009) continue;
        db.prepare(`DELETE FROM __drizzle_migrations WHERE id = ?`).run(row.id);
        console.log(`[db] Pre-migration compat: removed phantom migration record (hash=${row.hash.slice(0, 12)}…, created_at=${row.created_at})`);
      }
    }

    // --- Fix 1: migration 0009 ---------------------------------------------------
    // 0009_young_chameleon.sql:
    //   ALTER TABLE conversations RENAME COLUMN "provider_instance_id" TO "provider_preset_id"
    //
    // If db:push already renamed the column, the ALTER fails.  Mark as applied
    // using the correct hash and the journal's folderMillis (NOT Date.now()).
    const m0009Applied = db.prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`).get(HASH_0009);

    if (!m0009Applied) {
      const cols = db.prepare(`PRAGMA table_info(conversations)`).all() as Array<{ name: string }>;
      const hasNewCol = cols.some((c) => c.name === 'provider_preset_id');
      const hasOldCol = cols.some((c) => c.name === 'provider_instance_id');

      if (hasNewCol && !hasOldCol) {
        db.prepare(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)`).run(HASH_0009, MILLIS_0009);
        console.log('[db] Pre-migration compat: marked migration 0009 as applied (column already renamed via db:push)');
      }
    }

    // --- Fix 2: migration 0010 ---------------------------------------------------
    // 0010_thick_preak.sql creates all memory_* tables and ends with:
    //   DROP INDEX idx_chat_messages_conv_seq;
    //   CREATE UNIQUE INDEX uq_chat_messages_conv_seq ...
    //
    // ensureChatMessageSequenceIndex() (run after every boot) may have already
    // created uq_chat_messages_conv_seq, causing the CREATE to fail and rolling
    // back the entire migration (including all memory tables).
    if (!memoryTablesExist) {
      try {
        db.exec(`DROP INDEX IF EXISTS uq_chat_messages_conv_seq`);
        console.log('[db] Pre-migration compat: dropped pre-existing uq_chat_messages_conv_seq for migration 0010');
      } catch {
        /* ignore */
      }

      const oldIdx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_chat_messages_conv_seq'`).get();
      if (!oldIdx) {
        try {
          db.exec(`CREATE INDEX idx_chat_messages_conv_seq ON chat_messages (conversation_id, seq)`);
          console.log('[db] Pre-migration compat: recreated idx_chat_messages_conv_seq for migration 0010');
        } catch {
          /* ignore – table may not exist yet on fresh install */
        }
      }
    }
  } catch (e) {
    console.warn('[db] preMigrationCompat failed (non-fatal):', e);
  }
}

function initSchema(): void {
  if (!db) return;

  // Fix up known migration conflicts before running Drizzle migrate()
  preMigrationCompat();

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
  ensureChatMessageSequenceIndex();
  // vec_docs_* tables are managed by sqlite-vec extension; created lazily per dimension
  // Each dimension has its own virtual table (e.g., vec_docs_384, vec_docs_768)
  // This allows multiple embedding dimensions to coexist in the same database
  setupTriggers();
  // 迁移旧的 vec_docs 表（如果存在）
  migrateOldVecTable();
  // 创建记忆系统 FTS5 虚拟表
  ensureMemoryFTS();
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

// ==================== Database Backup ====================

export interface BackupInfo {
  path: string;
  fileName: string;
  size: number;
  createdAt: Date;
}

/**
 * Create a backup of the database using SQLite's online backup API.
 * This is the safest way to backup a live SQLite database.
 * @param customPath Optional custom directory path for the backup
 * @returns The path to the backup file
 */
export function backupDatabase(customPath?: string): { ok: true; path: string } | { ok: false; error: string } {
  if (!db) {
    return { ok: false, error: 'Database not initialized' };
  }

  try {
    const userDir = app.getPath('userData');
    const dbDir = path.join(userDir, 'data');
    const backupDir = customPath || path.join(dbDir, 'backups');

    // Ensure backup directory exists
    ensureDir(backupDir);

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dbFileName = Env.isDev() ? 'app-dev.db' : 'app.db';
    const backupFileName = `${dbFileName}.backup.${timestamp}`;
    const backupPath = path.join(backupDir, backupFileName);

    // Use better-sqlite3's backup method (atomic, safe for live database)
    db.backup(backupPath);

    console.log(`[db] Database backed up to: ${backupPath}`);
    return { ok: true, path: backupPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[db] Backup failed:', errorMsg);
    return { ok: false, error: errorMsg };
  }
}

/**
 * List all backup files in the backup directory
 * @param customPath Optional custom backup directory path
 */
export function listBackups(customPath?: string): { ok: true; backups: BackupInfo[] } | { ok: false; error: string } {
  try {
    const userDir = app.getPath('userData');
    const dbDir = path.join(userDir, 'data');
    const backupDir = customPath || path.join(dbDir, 'backups');

    if (!fs.existsSync(backupDir)) {
      return { ok: true, backups: [] };
    }

    const dbFileName = Env.isDev() ? 'app-dev.db' : 'app.db';
    const backupPattern = new RegExp(`^${dbFileName}\\.backup\\.`);

    const files = fs.readdirSync(backupDir);
    const backups: BackupInfo[] = [];

    for (const file of files) {
      if (backupPattern.test(file)) {
        const filePath = path.join(backupDir, file);
        const stats = fs.statSync(filePath);
        backups.push({
          path: filePath,
          fileName: file,
          size: stats.size,
          createdAt: stats.birthtime
        });
      }
    }

    // Sort by creation time, newest first
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return { ok: true, backups };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Delete a backup file
 */
export function deleteBackup(backupPath: string): { ok: true } | { ok: false; error: string } {
  try {
    if (!fs.existsSync(backupPath)) {
      return { ok: false, error: 'Backup file not found' };
    }

    fs.unlinkSync(backupPath);
    console.log(`[db] Backup deleted: ${backupPath}`);
    return { ok: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Restore database from a backup file
 * This will:
 * 1. Close the current database connection
 * 2. Rename current db to .old (safety backup)
 * 3. Copy the backup file to the current db location
 * 4. The app needs to be restarted to reinitialize the database
 */
export async function restoreBackup(backupPath: string): Promise<{ ok: true; requiresRestart: true } | { ok: false; error: string }> {
  try {
    if (!fs.existsSync(backupPath)) {
      return { ok: false, error: 'Backup file not found' };
    }

    const userDir = app.getPath('userData');
    const dbDir = path.join(userDir, 'data');
    const dbFileName = Env.isDev() ? 'app-dev.db' : 'app.db';
    const dbPath = path.join(dbDir, dbFileName);
    const oldPath = `${dbPath}.old`;

    // Close current database connection properly
    if (db) {
      try {
        // First, checkpoint WAL to merge all changes into main database
        // This is critical for Windows which locks files more aggressively
        console.log('[db] Performing WAL checkpoint before restore...');
        db.pragma('wal_checkpoint(TRUNCATE)');
        console.log('[db] WAL checkpoint completed');

        // Now close the connection
        db.close();
        db = null;
        console.log('[db] Database connection closed for restore');

        // Give OS a moment to release file locks (especially important on Windows)
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (e) {
        console.warn('[db] Failed to close database:', e);
      }
    }

    // Also handle WAL files - delete them before renaming main db
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;

    // Try to delete WAL and SHM files first
    try {
      if (fs.existsSync(walPath)) {
        fs.unlinkSync(walPath);
        console.log('[db] Deleted WAL file');
      }
      if (fs.existsSync(shmPath)) {
        fs.unlinkSync(shmPath);
        console.log('[db] Deleted SHM file');
      }
    } catch (e) {
      console.warn('[db] Failed to delete WAL/SHM files:', e);
    }

    // Rename current db to .old (safety backup)
    if (fs.existsSync(dbPath)) {
      // Remove old .old file if exists
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
      fs.renameSync(dbPath, oldPath);
      console.log(`[db] Current database renamed to ${oldPath}`);
    }

    // Copy backup to current db location
    fs.copyFileSync(backupPath, dbPath);
    console.log(`[db] Backup restored from ${backupPath}`);

    return { ok: true, requiresRestart: true };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[db] Restore failed:', errorMsg);
    return { ok: false, error: errorMsg };
  }
}

/**
 * Import a backup file from an external location
 * Copies the file to the backup directory and optionally restores it
 */
export async function importBackup(sourcePath: string, options?: { restore?: boolean }): Promise<{ ok: true; backupPath: string; requiresRestart?: boolean } | { ok: false; error: string }> {
  try {
    if (!fs.existsSync(sourcePath)) {
      return { ok: false, error: 'Source file not found' };
    }

    const userDir = app.getPath('userData');
    const dbDir = path.join(userDir, 'data');
    const backupDir = path.join(dbDir, 'backups');
    ensureDir(backupDir);

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const dbFileName = Env.isDev() ? 'app-dev.db' : 'app.db';
    const backupFileName = `${dbFileName}.backup.${timestamp}.imported`;
    const backupPath = path.join(backupDir, backupFileName);

    // Copy the file to backup directory
    fs.copyFileSync(sourcePath, backupPath);
    console.log(`[db] Backup imported to ${backupPath}`);

    // If restore option is true, restore the backup
    if (options?.restore) {
      const restoreResult = await restoreBackup(backupPath);
      if (!restoreResult.ok) {
        return restoreResult;
      }
      return { ok: true, backupPath, requiresRestart: true };
    }

    return { ok: true, backupPath };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[db] Import failed:', errorMsg);
    return { ok: false, error: errorMsg };
  }
}

export * as Schema from './schema';
