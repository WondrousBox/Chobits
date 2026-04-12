/**
 * Memory Cleanup Service
 * 当对话被删除时，清理关联的记忆数据。
 *
 * 策略：
 * - 如果 note 只来源于被删的对话 → 完整删除（DB 索引 + FTS + 边 + 关键词关联 + Markdown 文件）
 * - 如果 note 来源于多个对话 → 仅从 sourceConversationIds 中移除，note 保留
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { clearMemorySearchCache } from '../../../../packages/ai/services/memory-retrieval-service';
import { getDB } from '../../db';
import { MemoryFTSRepo } from '../../db/memory-fts-repo';
import { MemoryEdgeRepo, MemoryNoteKeywordRepo, MemoryNoteRepo } from '../../db/memory-repositories';
import { WorkspacesRepo } from '../../db/repositories';

interface NoteTopicInfo {
  parentTopicId?: string | null;
  relatedTopicIds?: string | null;
  topics?: string | null;
}

/**
 * 当对话被删除时，清理关联的记忆数据。
 * 异步执行，不阻塞删除主流程。
 */
export async function cleanupMemoryForConversations(conversationIds: string[]): Promise<{
  updated: number;
  deleted: number;
  errors: string[];
}> {
  let updated = 0;
  let deleted = 0;
  const errors: string[] = [];
  const touchedWorkspaceIds = new Set<string>();
  let shouldClearAllSearchCache = false;

  for (const convId of conversationIds) {
    try {
      const { updated: updatedNotes, orphaned } = await MemoryNoteRepo.removeConversationSource(convId);
      updated += updatedNotes.length;
      for (const note of updatedNotes) {
        const workspaceId = note.workspaceId;
        if (typeof workspaceId === 'string' && workspaceId.trim()) touchedWorkspaceIds.add(workspaceId);
        else shouldClearAllSearchCache = true;
      }

      // 完整删除孤立 note
      for (const note of orphaned) {
        try {
          if (note.workspaceId) touchedWorkspaceIds.add(note.workspaceId);
          else shouldClearAllSearchCache = true;
          await fullDeleteMemoryNote(note.id, note.workspaceId, note.filePath);
          deleted++;
        } catch (e: any) {
          errors.push(`Failed to delete note ${note.id}: ${e?.message}`);
        }
      }
    } catch (e: any) {
      errors.push(`Failed to cleanup for conversation ${convId}: ${e?.message}`);
    }
  }

  if (deleted > 0 || updated > 0) {
    console.log(`[Memory] Cleanup: ${deleted} notes deleted, ${updated} notes updated`);
    if (shouldClearAllSearchCache) {
      clearMemorySearchCache();
    } else {
      for (const workspaceId of touchedWorkspaceIds) {
        clearMemorySearchCache(workspaceId);
      }
    }
  }

  // 清理与被删对话关联的 sync_jobs
  const rawDb = getDB();
  if (rawDb) {
    for (const convId of conversationIds) {
      try {
        // sync_jobs 的 target_conversation_ids 是 JSON 数组，这里做精确匹配，避免子串误删。
        rawDb
          .prepare(
            `
            DELETE FROM memory_sync_jobs
            WHERE target_conversation_ids IS NOT NULL
              AND EXISTS (
                SELECT 1
                FROM json_each(memory_sync_jobs.target_conversation_ids)
                WHERE json_each.value = ?
              )
          `
          )
          .run(convId);
      } catch (e: any) {
        errors.push(`Failed to cleanup sync_jobs for conversation ${convId}: ${e?.message}`);
      }
    }
  }

  return { updated, deleted, errors };
}

/**
 * 清除工作空间内所有记忆数据：DB 全部 7 张表 + FTS 虚拟表 + memory/ 目录下所有文件。
 * 用于测试和重置。
 */
export async function clearAllMemory(workspaceId?: string): Promise<{
  tablesCleared: string[];
  filesDeleted: number;
  errors: string[];
}> {
  const tablesCleared: string[] = [];
  const errors: string[] = [];
  let filesDeleted = 0;

  const rawDb = getDB();
  if (!rawDb) {
    return { tablesCleared: [], filesDeleted: 0, errors: ['Database not available'] };
  }

  // 1. 清除所有 DB 表（按依赖顺序删除，子表先删）
  const tables = ['memory_note_keywords', 'memory_sections', 'memory_edges', 'memory_sync_jobs', 'memory_keywords', 'memory_notes', 'memory_topics'];

  for (const table of tables) {
    try {
      if (workspaceId) {
        // 按 workspace 删除（memory_sections 和 memory_note_keywords 没有 workspace_id，需通过 note_id 关联）
        if (table === 'memory_sections') {
          rawDb.prepare(`DELETE FROM memory_sections WHERE note_id IN (SELECT id FROM memory_notes WHERE workspace_id = ?)`).run(workspaceId);
        } else if (table === 'memory_note_keywords') {
          rawDb.prepare(`DELETE FROM memory_note_keywords WHERE note_id IN (SELECT id FROM memory_notes WHERE workspace_id = ?)`).run(workspaceId);
        } else if (table === 'memory_edges') {
          rawDb.prepare(`DELETE FROM memory_edges WHERE workspace_id = ? OR workspace_id IS NULL`).run(workspaceId);
        } else {
          rawDb.prepare(`DELETE FROM ${table} WHERE workspace_id = ?`).run(workspaceId);
        }
      } else {
        rawDb.prepare(`DELETE FROM ${table}`).run();
      }
      tablesCleared.push(table);
    } catch (e: any) {
      errors.push(`Failed to clear ${table}: ${e?.message}`);
    }
  }

  // 2. 清除 FTS 虚拟表（contentless FTS5 不支持 DELETE FROM，需 DROP + CREATE）
  try {
    rawDb.exec('DROP TABLE IF EXISTS memory_notes_fts');
    rawDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_notes_fts USING fts5(
        entry_id,
        entry_type,
        note_id,
        title,
        summary,
        keywords,
        aliases,
        entities,
        body,
        content='',
        tokenize='unicode61 remove_diacritics 2'
      );
    `);
    tablesCleared.push('memory_notes_fts');
  } catch (e: any) {
    errors.push(`Failed to clear FTS: ${e?.message}`);
  }

  // 3. 删除 workspace 下的 memory/ 目录
  const wsIds = workspaceId ? [workspaceId] : await getAllWorkspaceIds();
  for (const wsId of wsIds) {
    try {
      const ws = await WorkspacesRepo.getById(wsId);
      if (ws?.rootPath) {
        const memoryDir = path.join(ws.rootPath, 'memory');
        const count = await removeDirRecursive(memoryDir);
        filesDeleted += count;
      }
    } catch (e: any) {
      errors.push(`Failed to delete memory files for workspace ${wsId}: ${e?.message}`);
    }
  }

  console.log(`[Memory] Clear all: ${tablesCleared.length} tables cleared, ${filesDeleted} files deleted`);
  clearMemorySearchCache(workspaceId);
  return { tablesCleared, filesDeleted, errors };
}

/** 获取所有 workspace IDs */
async function getAllWorkspaceIds(): Promise<string[]> {
  const rawDb = getDB();
  if (!rawDb) return [];
  const rows = rawDb.prepare('SELECT id FROM workspaces').all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** 递归删除目录，返回删除的文件数 */
async function removeDirRecursive(dirPath: string): Promise<number> {
  try {
    const stat = await fs.stat(dirPath).catch(() => null);
    if (!stat?.isDirectory()) return 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += await removeDirRecursive(fullPath);
      } else {
        await fs.unlink(fullPath).catch(() => { });
        count++;
      }
    }
    await fs.rmdir(dirPath).catch(() => { });
    return count;
  } catch {
    return 0;
  }
}

/**
 * 完整删除一个 memory note：DB 索引 + FTS + 边 + 关键词关联 + 孤立 topics/keywords + Markdown 文件
 */
async function fullDeleteMemoryNote(noteId: string, workspaceId?: string | null, filePath?: string | null): Promise<void> {
  const rawDb = getDB();

  // 0. 在删除 note 之前，收集它关联的 topic IDs（用于后续孤立清理）
  const topicIds: string[] = [];
  if (rawDb) {
    const noteRow = rawDb.prepare('SELECT parent_topic_id, related_topic_ids, topics FROM memory_notes WHERE id = ?').get(noteId) as NoteTopicInfo | undefined;
    if (noteRow) {
      if (noteRow.parentTopicId) topicIds.push(noteRow.parentTopicId);
      try {
        const related = JSON.parse(noteRow.relatedTopicIds || '[]');
        if (Array.isArray(related)) topicIds.push(...related);
      } catch {
        /* ignore */
      }
      // 从 topics JSON 数组（topic labels）解析出对应的 topic IDs
      try {
        const topicLabels: string[] = JSON.parse(noteRow.topics || '[]');
        if (Array.isArray(topicLabels)) {
          for (const label of topicLabels) {
            const slug = label
              .toLowerCase()
              .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
              .replace(/^-|-$/g, '')
              .slice(0, 40);
            const topicId = `topic_${slug}`;
            topicIds.push(topicId);
            // 也用 slug 做精确查询以防 ID 不匹配
            const topicRow = rawDb.prepare('SELECT id FROM memory_topics WHERE slug = ? LIMIT 1').get(slug) as { id: string } | undefined;
            if (topicRow && topicRow.id !== topicId) {
              topicIds.push(topicRow.id);
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  // 1. 删除 FTS 条目
  MemoryFTSRepo.deleteByNote(noteId);
  // 2. 删除图谱边
  await MemoryEdgeRepo.deleteByNote(noteId);
  await MemoryEdgeRepo.deleteByEvidenceNote(noteId);
  // 3. 删除 note-keyword 关联（先收集关联的 keyword IDs）
  let keywordIds: string[] = [];
  if (rawDb) {
    const kwRows = rawDb.prepare('SELECT keyword_id FROM memory_note_keywords WHERE note_id = ?').all(noteId) as Array<{ keyword_id: string }>;
    keywordIds = kwRows.map((r) => r.keyword_id);
  }
  await MemoryNoteKeywordRepo.deleteByNote(noteId);
  // 4. 硬删除 note（cascade 删 sections）
  await MemoryNoteRepo.deleteByIds([noteId]);

  // 5. 清理孤立的 keywords（不再被任何 note 引用的）
  if (rawDb && keywordIds.length > 0) {
    for (const kwId of keywordIds) {
      const remaining = rawDb.prepare('SELECT 1 FROM memory_note_keywords WHERE keyword_id = ? LIMIT 1').get(kwId);
      if (!remaining) {
        rawDb.prepare('DELETE FROM memory_keywords WHERE id = ?').run(kwId);
      }
    }
  }

  // 6. 清理孤立的 topics（不再被任何 note 引用的）
  if (rawDb && topicIds.length > 0) {
    const uniqueTopicIds = [...new Set(topicIds)];
    for (const topicId of uniqueTopicIds) {
      // 先确认 topic 是否存在
      const topicRow = rawDb.prepare('SELECT id, label FROM memory_topics WHERE id = ?').get(topicId) as { id: string; label: string } | undefined;
      if (!topicRow) continue;

      // 检查 topics JSON 数组中是否还有其他 note 引用该 topic label
      const inTopicsArray = rawDb.prepare('SELECT 1 FROM memory_notes WHERE topics LIKE ? AND deleted_at IS NULL LIMIT 1').get(`%${topicRow.label}%`);
      if (inTopicsArray) continue;

      // 检查 parentTopicId 是否还被引用
      const asParent = rawDb.prepare('SELECT 1 FROM memory_notes WHERE parent_topic_id = ? AND deleted_at IS NULL LIMIT 1').get(topicId);
      if (asParent) continue;

      // 也检查 related_topic_ids 中是否还被引用
      const asRelated = rawDb.prepare('SELECT 1 FROM memory_notes WHERE related_topic_ids LIKE ? AND deleted_at IS NULL LIMIT 1').get(`%${topicId}%`);
      if (asRelated) continue;

      // 也检查是否还有子 topic 引用它
      const hasChildren = rawDb.prepare('SELECT 1 FROM memory_topics WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1').get(topicId);
      if (!hasChildren) {
        rawDb.prepare('DELETE FROM memory_topics WHERE id = ?').run(topicId);
      }
    }
  }

  // 7. 删除 Markdown 文件
  if (filePath && workspaceId) {
    try {
      const ws = await WorkspacesRepo.getById(workspaceId);
      if (ws?.rootPath) {
        const absolutePath = path.join(ws.rootPath, filePath);
        await fs.unlink(absolutePath).catch(() => { });
      }
    } catch {
      // 文件不存在或无法删除，不影响主流程
    }
  }
}
