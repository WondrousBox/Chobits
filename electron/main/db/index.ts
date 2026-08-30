// Use default import; better-sqlite3 exports a callable/constructable function.
// Using namespace import causes 'is not a constructor' at runtime.
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { app } from 'electron';

import { binPathLog } from '../logger';
import { Env } from '../utils';

let db: Database.Database | null = null;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
  return db;
}

let orm: any = null;

export function getOrm(): any {
  if (orm) return orm;
  const db = getDB() as any;
  orm = drizzle(db);
  return orm;
}

/**
 * 清理历史遗留触发器。
 * mini 分支已删除 recycle_bin/documents/resources/folders 等表，
 * 旧库上残留的触发器引用了这些表，若不删除会在软删/删除会话等操作时
 * 报 "no such table" 错误，这里统一 DROP。
 */
function setupTriggers(): void {
  if (!db) return;
  try {
    const legacyTriggers = [
      'trg_documents_soft_delete',
      'trg_documents_restore',
      'trg_documents_delete',
      'trg_resources_soft_delete',
      'trg_resources_restore',
      'trg_resources_delete',
      'trg_conversations_soft_delete',
      'trg_conversations_restore',
      'trg_conversations_delete',
      'trg_folders_soft_delete',
      'trg_folders_restore',
      'trg_folders_delete'
    ];
    for (const name of legacyTriggers) {
      db.exec(`DROP TRIGGER IF EXISTS ${name}`);
    }
  } catch (e) {
    console.warn('[db] setupTriggers failed', e);
  }
}

/**
 * 清理 drizzle 迁移无法覆盖的遗留对象。
 * memory_notes_fts 是早期迁移用原生 SQL 创建的 FTS5 虚拟表，
 * 不在 drizzle schema/snapshot 中，0022 的 DROP 系列不会触碰它，
 * 其主体表 memory_notes 已删除，这里连带影子表一起清理。
 */
function dropLegacyOrphanTables(): void {
  if (!db) return;
  try {
    db.exec(`DROP TABLE IF EXISTS memory_notes_fts`);
  } catch (e) {
    console.warn('[db] dropLegacyOrphanTables failed', e);
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
 *
 * mini 分支注意：0022 起 memory_* 等表会被 DROP，不能再以 memory_topics
 * 是否存在来判断 0010 是否已应用，必须改查 __drizzle_migrations 里
 * 0010 的 hash，否则已应用 0022 的库会被误判为"0010 未应用"，
 * 导致 0022 的迁移记录被当作 phantom row 删掉、下次启动重复执行 DROP。
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
    const HASH_0010 = '851995b79b251091833e27e11d95a823b80505d64ce0130e0ae583fab0c7c806';

    // 0010 是否已真正应用过（以迁移记录为准，而非 memory 表是否存在）
    const m0010Applied = !!db.prepare(`SELECT 1 FROM __drizzle_migrations WHERE hash = ?`).get(HASH_0010);

    const memoryTablesExist = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='memory_topics'`).get();
    // 0010 尚未应用的旧库才需要下面的 phantom 清理与 0010 兼容修复
    const needsCompat0010 = !m0010Applied && !memoryTablesExist;

    // --- Cleanup: remove phantom migration records --------------------------------
    // If migration 0010 was never successfully applied, delete any
    // __drizzle_migrations rows at/after 0009's timestamp that aren't the
    // correct 0009 record — these are leftovers from buggy previous compat
    // fixes that used Date.now() as created_at, blocking subsequent migrations.
    if (needsCompat0010) {
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
    if (needsCompat0010) {
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
  setupTriggers();
  dropLegacyOrphanTables();
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
    console.error('[db] Backup failed:', errorMsg);
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
    console.error('[db] Backup failed:', errorMsg);
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

    // Copy the file to the backup directory
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
