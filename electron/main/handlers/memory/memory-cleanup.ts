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

import { MemoryEdgeRepo, MemoryFTSRepo, MemoryNoteKeywordRepo, MemoryNoteRepo } from '../../db/memory-repositories';
import { WorkspacesRepo } from '../../db/repositories';

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

  for (const convId of conversationIds) {
    try {
      const { updated: updatedNotes, orphaned } = await MemoryNoteRepo.removeConversationSource(convId);
      updated += updatedNotes.length;

      // 完整删除孤立 note
      for (const note of orphaned) {
        try {
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
  }
  return { updated, deleted, errors };
}

/**
 * 完整删除一个 memory note：DB 索引 + FTS + 边 + 关键词关联 + Markdown 文件
 */
async function fullDeleteMemoryNote(noteId: string, workspaceId?: string | null, filePath?: string | null): Promise<void> {
  // 1. 删除 FTS 条目
  MemoryFTSRepo.deleteByNote(noteId);
  // 2. 删除图谱边
  await MemoryEdgeRepo.deleteByNote(noteId);
  // 3. 删除 note-keyword 关联
  await MemoryNoteKeywordRepo.deleteByNote(noteId);
  // 4. 硬删除 note（cascade 删 sections）
  await MemoryNoteRepo.deleteByIds([noteId]);

  // 5. 删除 Markdown 文件
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
