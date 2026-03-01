import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, like, lte, max } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { getDB, getOrm } from '.';
import { deleteVectors, rebuildVectors } from '.';
import {
  automation_rules,
  type AutomationRuleRow,
  chat_messages,
  type ChatMessageRow,
  type ConversationRow,
  conversations,
  type DocumentRow,
  documents,
  type FolderRow,
  folders,
  type NewAutomationRule,
  type NewChatMessage,
  type NewConversation,
  type NewDocument,
  type NewFolder,
  type NewRecycleBin,
  type NewRssFeedItem,
  type NewWorkspace,
  recycle_bin,
  type RecycleBinRow,
  rss_feed_items,
  type RssFeedItemRow,
  type WorkspaceRow,
  workspaces
} from './schema';
import { type NewResource, resource_tags, type ResourceRow, resources } from './schema';

function omitId<T extends { id?: any }>(obj: T): Omit<T, 'id'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = obj || ({} as any);
  return rest as any;
}

/**
 * 文档表操作空间
 * - 支持 upsert、批量 upsert、单条/批量删除、软删除、恢复、更新、分页、筛选、计数、存在性判断等
 * - 所有字段均支持写入和筛选
 * - 推荐所有写操作用事务包裹（如批量）
 */
export const DocumentsRepo = {
  /**
   * 新增或更新单条文档（主键冲突自动更新）
   * @param doc 文档对象（所有字段均可填）
   */
  async upsert(doc: NewDocument): Promise<DocumentRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(documents)
      .values(doc as any)
      .onConflictDoUpdate({ target: documents.id, set: omitId(doc as any) })
      .returning()
      .all();
    return rows[0];
  },
  /**
   * 批量新增或更新文档（主键冲突自动更新）
   * @param docs 文档对象数组
   */
  async bulkUpsert(docs: NewDocument[]): Promise<DocumentRow[]> {
    const db = getOrm();
    if (!docs.length) return [];
    const rows = await db
      .insert(documents)
      .values(docs as any)
      .onConflictDoUpdate({ target: documents.id, set: omitId((docs[0] as any) || {}) })
      .returning()
      .all();
    return rows;
  },
  /**
   * 根据主键获取文档
   * @param id 文档ID
   */
  async getById(id: string): Promise<DocumentRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    return rows[0];
  },
  /**
   * 批量物理删除文档（不可恢复）
   * @param ids 文档ID数组
   * @returns 实际删除数量
   */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    // 删除向量表记录
    deleteVectors(ids);
    const res = await db.delete(documents).where(inArray(documents.id, ids)).run();
    // 清理回收站索引（若有残留）
    await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids)).run();
    return (res as any).changes ?? 0;
  },
  /**
   * 软删除（仅标记 deletedAt，不物理删除）
   * @param ids 文档ID数组
   * @returns 实际标记数量
   */
  async softDelete(ids: string[]): Promise<DocumentRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    const now = Date.now();
    let updatedRows: any[] = [];
    (db as any).transaction((tx: any) => {
      updatedRows = tx.update(documents).set({ deletedAt: now }).where(inArray(documents.id, ids)).returning().all();
      const items = updatedRows.map((r: any) => ({
        id: `doc:${r.id}`,
        entityType: 'document',
        entityId: r.id,
        title: r.title ?? r.content?.slice(0, 80) ?? r.id,
        summary: r.content?.slice(0, 160) ?? null,
        reason: 'user-delete',
        deletedAt: now,
        deletedBy: 'system',
        payload: JSON.stringify({ id: r.id }),
        expireAt: null
      }));
      if (items.length) {
        tx.insert(recycle_bin)
          .values(items as any)
          .onConflictDoUpdate({
            target: recycle_bin.id,
            set: { deletedAt: now }
          })
          .run?.();
      }
      deleteVectors(ids);
    });
    return updatedRows as any;
  },
  /**
   * 恢复软删除（清空 deletedAt）
   * @param ids 文档ID数组
   * @returns 实际恢复数量
   */
  async restore(ids: string[]): Promise<DocumentRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    let rows: any[] = [];
    (db as any).transaction((tx: any) => {
      rows = tx.update(documents).set({ deletedAt: null, updatedAt: Date.now() }).where(inArray(documents.id, ids)).returning().all();
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids)).run?.();
    });
    return rows as any;
  },

  /**
   * 恢复并重建向量索引（需要调用方提供 dim）
   */
  async restoreWithIndex(ids: string[], dim: number): Promise<DocumentRow[]> {
    if (!ids.length) return [];
    const rows = await this.restore(ids);
    if (rows.length > 0) rebuildVectors(ids, dim);
    return rows;
  },

  /**
   * 软删除并写入回收站（带索引）
   */
  async softDeleteWithIndex(ids: string[]): Promise<DocumentRow[]> {
    return this.softDelete(ids);
  },

  /**
   * 彻底删除并清理回收站
   */
  async purgeWithIndex(ids: string[]): Promise<number> {
    const deleted = await this.deleteByIds(ids);
    return deleted;
  }
};
/**
 * 回收站操作空间
 * - 支持 list、add、restore、purge、count、exists、批量操作
 * - 仅存索引和快照，实际数据操作回到原表
 */
export const RecycleBinRepo = {
  /**
   * 新增回收站索引（软删除时调用）
   */
  async add(item: NewRecycleBin) {
    const db = getOrm();
    await db
      .insert(recycle_bin)
      .values(item)
      .onConflictDoUpdate({
        target: recycle_bin.id,
        set: { ...item }
      })
      .run();
  },
  /**
   * 批量新增回收站索引
   */
  async bulkAdd(items: NewRecycleBin[]) {
    const db = getOrm();
    if (!items.length) return;
    await db
      .insert(recycle_bin)
      .values(items)
      .onConflictDoUpdate({
        target: recycle_bin.id,
        set: { ...items[0] }
      })
      .run();
  },
  /**
   * 回收站列表（支持筛选/分页）
   */
  async list(filter: Partial<RecycleBinRow> = {}, limit = 100, offset = 0): Promise<RecycleBinRow[]> {
    const db = getOrm();
    let query = db.select().from(recycle_bin);
    const wheres: any[] = [];
    if (filter.entityType) wheres.push(eq(recycle_bin.entityType, filter.entityType));
    if (filter.deletedBy) wheres.push(eq(recycle_bin.deletedBy, filter.deletedBy));
    if (filter.deletedAt) wheres.push(gte(recycle_bin.deletedAt, filter.deletedAt));
    if (filter.expireAt) wheres.push(lte(recycle_bin.expireAt, filter.expireAt));
    if (wheres.length) query = query.where(and(...wheres));
    return query.limit(limit).offset(offset);
  },
  /**
   * 统计回收站数量（可选筛选）
   */
  async count(filter: Partial<RecycleBinRow> = {}): Promise<number> {
    const db = getOrm();
    let query = db.select({ count: recycle_bin.id }).from(recycle_bin);
    const wheres: any[] = [];
    if (filter.entityType) wheres.push(eq(recycle_bin.entityType, filter.entityType));
    if (filter.deletedBy) wheres.push(eq(recycle_bin.deletedBy, filter.deletedBy));
    if (filter.deletedAt) wheres.push(gte(recycle_bin.deletedAt, filter.deletedAt));
    if (filter.expireAt) wheres.push(lte(recycle_bin.expireAt, filter.expireAt));
    if (wheres.length) query = query.where(and(...wheres));
    const rows = await query;
    return rows[0]?.count ?? 0;
  },
  /**
   * 判断回收站索引是否存在
   */
  async exists(id: string): Promise<boolean> {
    const db = getOrm();
    const rows = await db.select().from(recycle_bin).where(eq(recycle_bin.id, id)).limit(1);
    return !!rows.length;
  },
  /**
   * 批量彻底删除回收站索引（物理删除，原表需同步物理删除）
   */
  async purge(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(recycle_bin).where(inArray(recycle_bin.id, ids)).run();
    return (res as any).changes ?? 0;
  },
  /**
   * 恢复回收站索引（恢复原表后调用，物理删除索引）
   */
  async restore(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(recycle_bin).where(inArray(recycle_bin.id, ids)).run();
    return (res as any).changes ?? 0;
  },
  /** 根据回收站ID恢复实体（文档/资源），并同步清理回收站索引 */
  async restoreEntitiesByRecycleIds(ids: string[]): Promise<number> {
    if (!ids?.length) return 0;
    const db = getOrm();
    const items = (await db.select().from(recycle_bin).where(inArray(recycle_bin.id, ids))) as any[];
    if (!items.length) return 0;
    const docIds = items.filter((i) => i.entityType === 'document').map((i) => i.entityId);
    const resIds = items.filter((i) => i.entityType === 'resource').map((i) => i.entityId);
    const convIds = items.filter((i) => i.entityType === 'conversation').map((i) => i.entityId);
    const folderIds = items.filter((i) => i.entityType === 'folder').map((i) => i.entityId);
    let restored = 0;
    if (docIds.length) restored += (await DocumentsRepo.restore(docIds)).length;
    if (resIds.length) restored += (await ResourcesRepo.restore(resIds)).length;
    if (convIds.length) {
      for (const id of convIds) {
        const row = await ChatRepo.restoreConversation(id);
        if (row) restored += 1;
      }
    }
    if (folderIds.length) restored += (await FoldersRepo.restore(folderIds)).length;
    return restored;
  },
  /** 根据回收站ID彻底删除实体（文档/资源），并同步清理回收站索引 */
  async purgeEntitiesByRecycleIds(ids: string[]): Promise<number> {
    if (!ids?.length) return 0;
    const db = getOrm();
    const items = (await db.select().from(recycle_bin).where(inArray(recycle_bin.id, ids))) as any[];
    if (!items.length) return 0;
    const docIds = items.filter((i) => i.entityType === 'document').map((i) => i.entityId);
    const resIds = items.filter((i) => i.entityType === 'resource').map((i) => i.entityId);
    const conversationIds = items.filter((i) => i.entityType === 'conversation').map((i) => i.entityId);
    const folderIds = items.filter((i) => i.entityType === 'folder').map((i) => i.entityId);

    // If folders are being purged, we must:
    // 1) Collect all descendant folders
    // 2) Collect all resources under these folders
    // 3) Delete resources (DB + disk)
    // 4) Delete folder rows
    // 5) Delete physical directories under <workspace.root>/resources/folders/<folderId>
    const allFolderIds = new Set<string>(folderIds);
    if (folderIds.length) {
      // 1) BFS descendants
      let frontier = [...folderIds];
      while (frontier.length) {
        const rows = (await db
          .select({ id: folders.id })
          .from(folders)
          .where(inArray(folders.parentId as any, frontier))) as Array<{ id: string }>;
        const next: string[] = [];
        for (const r of rows) {
          if (!allFolderIds.has(r.id)) {
            allFolderIds.add(r.id);
            next.push(r.id);
          }
        }
        frontier = next;
      }

      // 2) Collect resources under these folders
      if (allFolderIds.size) {
        const folderIdList = Array.from(allFolderIds);
        const resRows = (await db
          .select({ id: resources.id })
          .from(resources)
          .where(inArray(resources.folderId as any, folderIdList))) as Array<{ id: string }>;
        for (const r of resRows) resIds.push(r.id);
      }
    }
    let deleted = 0;
    if (docIds.length) deleted += await DocumentsRepo.deleteByIds(docIds);
    if (resIds.length) deleted += await ResourcesRepo.deleteByIds(resIds);
    if (conversationIds.length) deleted += await ChatRepo.deleteConversations(conversationIds);
    if (allFolderIds.size) {
      const toDeleteIds = Array.from(allFolderIds);
      // 4) Delete folder rows (DB)
      if (toDeleteIds.length) deleted += await FoldersRepo.deleteByIds(toDeleteIds);
      // Also cleanup recycle_bin indices for these folders
      await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, toDeleteIds)).run();

      // 5) Delete physical directories per workspace
      try {
        // Query mapping: folderId -> workspaceId
        const folderRows = (await db.select({ id: folders.id, workspaceId: folders.workspaceId }).from(folders).where(inArray(folders.id, toDeleteIds))) as Array<{
          id: string;
          workspaceId: string | null;
        }>;
        // Collect unique workspaceIds from recycle items as fallback (if folder rows already deleted above, folderRows may be empty)
        const wsIds = new Set<string>();
        for (const fr of folderRows) if (fr.workspaceId) wsIds.add(fr.workspaceId);
        // If folderRows is empty (because of deletion order), try recovering wsIds from recycle_bin payload snapshot
        if (wsIds.size === 0) {
          for (const it of items) {
            if (it.entityType === 'folder' && it.payload) {
              try {
                const snap = JSON.parse(it.payload || '{}');
                if (snap?.workspaceId) wsIds.add(snap.workspaceId);
              } catch {
                /* ignore */
              }
            }
          }
        }
        // Load workspace roots
        const wsMap = new Map<string, string>();
        if (wsIds.size) {
          const wsList = (await db
            .select({ id: workspaces.id, rootPath: workspaces.rootPath })
            .from(workspaces)
            .where(inArray(workspaces.id, Array.from(wsIds)))) as Array<{ id: string; rootPath: string | null }>;
          for (const w of wsList) if (w.rootPath) wsMap.set(w.id, w.rootPath);
        }
        // Build deletion list by ws root; directories are flat: resources/folders/<folderId>
        const tryRm = async (abs?: string): Promise<void> => {
          if (!abs) return;
          try {
            if (fscb.existsSync(abs)) await fs.rm(abs, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        };
        // If we couldn't map specific workspaces, try default workspace root
        if (!wsMap.size) {
          // Fallback: attempt removing under any known roots (best-effort)
          // Load default workspace
          try {
            const ws = await WorkspacesRepo.getDefault();
            const root = ws?.rootPath;
            if (root) {
              await Promise.all(toDeleteIds.map((id) => tryRm(path.join(root, 'resources', 'folders', id))));
            }
          } catch {
            /* ignore */
          }
        } else {
          // Remove per workspace root
          const tasks: Array<Promise<void>> = [];
          for (const id of toDeleteIds) {
            // No strict mapping folder->ws root here; remove under all known roots to be safe
            for (const [, root] of wsMap) {
              tasks.push(tryRm(path.join(root, 'resources', 'folders', id)));
            }
          }
          if (tasks.length) await Promise.all(tasks);
        }
      } catch {
        /* ignore physical folder deletion errors */
      }
    }
    return deleted;
  },
  /** 清空回收站（按可选筛选），并对实体执行彻底删除 */
  async empty(filter: Partial<RecycleBinRow> = {}): Promise<number> {
    const items = await this.list(filter, 10000, 0);
    if (!items.length) return 0;
    const ids = items.map((i) => i.id);
    return this.purgeEntitiesByRecycleIds(ids);
  }
};

// ─── 资源文件回收站辅助函数 ───────────────────────────────────────────────

/**
 * 将资源物理文件移入 workspace 的 .trash/<resourceId>/ 目录，释放原文件名以供新资源使用。
 * 返回新的 trash 路径；若文件不存在或移动失败则返回 null。
 */
async function moveResourceFileToTrash(filePath: string, resourceId: string, workspaceRoot: string): Promise<string | null> {
  if (!filePath || !fscb.existsSync(filePath)) return null;
  const trashDir = path.join(workspaceRoot, 'resources', '.trash', resourceId);
  await fs.mkdir(trashDir, { recursive: true });
  const fileName = path.basename(filePath);
  const trashPath = path.join(trashDir, fileName);
  try {
    await fs.rename(filePath, trashPath);
    return trashPath;
  } catch (e: any) {
    if (e?.code === 'EXDEV') {
      // 跨分区：copy + unlink
      await fs.copyFile(filePath, trashPath);
      await fs.unlink(filePath);
      return trashPath;
    }
    console.warn('[moveResourceFileToTrash] failed:', e);
    return null;
  }
}

/**
 * 将资源物理文件从 .trash/ 恢复至原始路径。
 * 若原路径已被占用，则追加 (n) 后缀（与导入逻辑一致）。
 * 恢复成功后清理空的 trash 子目录。返回最终的文件路径。
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function restoreResourceFileFromTrash(trashPath: string, originalPath: string, _resourceId?: string): Promise<string> {
  if (!trashPath || !fscb.existsSync(trashPath)) return originalPath;

  const targetDir = path.dirname(originalPath);
  await fs.mkdir(targetDir, { recursive: true });

  let target = originalPath;
  // 处理命名冲突：若原位置已有同名文件，追加 (n) 后缀
  if (fscb.existsSync(target)) {
    const ext = path.extname(originalPath);
    const name = path.basename(originalPath, ext);
    let i = 1;
    while (fscb.existsSync(path.join(targetDir, `${name}(${i})${ext}`))) {
      i++;
    }
    target = path.join(targetDir, `${name}(${i})${ext}`);
  }

  try {
    await fs.rename(trashPath, target);
  } catch (e: any) {
    if (e?.code === 'EXDEV') {
      await fs.copyFile(trashPath, target);
      await fs.unlink(trashPath);
    } else {
      throw e;
    }
  }

  // 清理空的 trash 子目录
  try {
    const trashSubDir = path.dirname(trashPath);
    const remaining = await fs.readdir(trashSubDir);
    if (remaining.length === 0) {
      await fs.rmdir(trashSubDir);
    }
  } catch {
    /* ignore */
  }

  return target;
}

/**
 * 资源表操作空间
 * - 支持 upsert、批量 upsert、单条/批量删除、软删除、恢复、更新、分页、筛选、计数、存在性判断等
 * - 所有字段均支持写入和筛选
 * - 推荐所有写操作用事务包裹（如批量）
 */
export const ResourcesRepo = {
  /** 新增或更新单条资源（主键冲突自动更新） */
  async upsert(res: NewResource): Promise<ResourceRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(resources)
      .values(res as any)
      .onConflictDoUpdate({ target: resources.id, set: omitId(res as any) })
      .returning()
      .all();
    const row = rows[0];
    // 同步归一化标签表
    try {
      const tags = safeParseTags((res as any).tags);
      if (row && tags) await TagsRepo.replaceForResource(row.id, (row as any).workspaceId || null, tags);
    } catch {
      /* ignore */
    }
    return row;
  },
  /** 根据标签筛选资源（可选按工作空间、是否包含软删、分页） */
  async listByTag(tag: string, opts: { workspaceId?: string; includeDeleted?: boolean; limit?: number; offset?: number } = {}): Promise<ResourceRow[]> {
    const db = getOrm();
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;
    // 优化：列表查询排除大字段
    let q = db
      .select({
        id: resources.id,
        type: resources.type,
        title: resources.title,
        description: resources.description,
        url: resources.url,
        domain: resources.domain,
        sourceName: resources.sourceName,
        authorName: resources.authorName,
        language: resources.language,
        mimeType: resources.mimeType,
        sizeBytes: resources.sizeBytes,
        durationMs: resources.durationMs,
        width: resources.width,
        height: resources.height,
        filePath: resources.filePath,
        thumbnailPath: resources.thumbnailPath,
        previewUrl: resources.previewUrl,
        tags: resources.tags,
        categories: resources.categories,
        visibility: resources.visibility,
        nsfw: resources.nsfw,
        favorite: resources.favorite,
        rating: resources.rating,
        status: resources.status,
        collectedAt: resources.collectedAt,
        publishedAt: resources.publishedAt,
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
        deletedAt: resources.deletedAt,
        workspaceId: resources.workspaceId,
        folderId: resources.folderId,
        parentResourceId: resources.parentResourceId
      })
      .from(resources)
      .innerJoin(resource_tags, eq(resource_tags.resourceId, resources.id));
    const wheres: any[] = [eq(resource_tags.tag, tag)];
    if (opts.workspaceId) wheres.push(eq(resource_tags.workspaceId, opts.workspaceId));
    if (!opts.includeDeleted) wheres.push(isNull(resources.deletedAt));
    q = (q as any)
      .where(and(...wheres))
      .orderBy(desc(resources.updatedAt as any))
      .limit(limit)
      .offset(offset);
    const rows = (await q) as any[];
    return rows as any[];
  },
  /** 统计某标签下资源数量（可选按工作空间、是否包含软删） */
  async countByTag(tag: string, opts: { workspaceId?: string; includeDeleted?: boolean } = {}): Promise<number> {
    const db = getOrm();
    let q = db.select({ count: resources.id }).from(resources).innerJoin(resource_tags, eq(resource_tags.resourceId, resources.id));
    const wheres: any[] = [eq(resource_tags.tag, tag)];
    if (opts.workspaceId) wheres.push(eq(resource_tags.workspaceId, opts.workspaceId));
    if (!opts.includeDeleted) wheres.push(isNull(resources.deletedAt));
    q = (q as any).where(and(...wheres));
    const rows = (await q) as any[];
    return rows[0]?.count ?? 0;
  },
  /** 批量新增或更新资源（主键冲突自动更新） */
  async bulkUpsert(list: NewResource[]): Promise<ResourceRow[]> {
    if (!list.length) return [];
    const db = getOrm();
    const rows = await db
      .insert(resources)
      .values(list as any)
      .onConflictDoUpdate({ target: resources.id, set: omitId((list[0] as any) || {}) })
      .returning()
      .all();
    return rows;
  },
  /** 按ID获取资源 */
  async getById(id: string): Promise<ResourceRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
    return rows[0];
  },
  /** 判断资源是否存在 */
  async exists(id: string): Promise<boolean> {
    const db = getOrm();
    const rows = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
    return !!rows.length;
  },
  /** 更新资源（部分字段） */
  async update(id: string, patch: Partial<NewResource>): Promise<ResourceRow | undefined> {
    const db = getOrm();
    await db
      .update(resources)
      .set({ ...patch, updatedAt: Date.now() } as any)
      .where(eq(resources.id, id))
      .run();
    const rows = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
    const row = rows[0];
    // 如果本次更新包含 tags 字段，则同步归一化标签表
    if (row && Object.prototype.hasOwnProperty.call(patch, 'tags')) {
      try {
        const tags = safeParseTags((patch as any).tags);
        if (tags) await TagsRepo.replaceForResource(id, (row as any).workspaceId || null, tags);
      } catch {
        /* ignore */
      }
    }
    return row;
  },
  /** 批量物理删除资源，并清理回收站索引 */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();

    // 0) 查找所有子资源（translation、summary、mindmap 和 note 类型）并递归删除
    const childResIds: string[] = [];
    for (const parentId of ids) {
      try {
        const children = await this.listChildren(parentId, 1000, 0);
        for (const child of children as any[]) {
          // 只处理 translation、summary 和 mindmap 类型的子资源
          if (child.type === 'translation' || child.type === 'summary' || child.type === 'mindmap' || child.type === 'note' || child.type === 'segments') {
            childResIds.push(child.id);
          }
        }
      } catch (e) {
        console.warn('[deleteByIds] 查找子资源失败:', e);
      }
    }

    // 合并所有要删除的资源 ID（父资源 + 子资源）
    const allIdsToDelete = [...ids, ...childResIds];

    // // 0) 递归找出所有“以待删资源为祖先”的子资源（不限类型，避免以后新增类型又无法删除）
    // const allIdsToDelete: string[] = [...ids];
    // let prevLength = 0;
    // while (prevLength !== allIdsToDelete.length) {
    //   prevLength = allIdsToDelete.length;
    //   const rows = await db.select({ id: resources.id }).from(resources).where(inArray(resources.parentResourceId, allIdsToDelete));
    //   for (const r of rows as any[]) {
    //     if (r?.id && !allIdsToDelete.includes(r.id)) allIdsToDelete.push(r.id);
    //   }
    // }
    // const childResIds = allIdsToDelete.filter((id) => !ids.includes(id));

    // 1) 预取将要删除的资源行，收集文件/缩略图路径
    const toDeleteRows = await db.select().from(resources).where(inArray(resources.id, allIdsToDelete));
    const filePaths: string[] = [];
    const thumbPaths: string[] = [];
    for (const r of toDeleteRows as any[]) {
      if (r?.filePath) filePaths.push(r.filePath);
      if (r?.thumbnailPath) thumbPaths.push(r.thumbnailPath);
      // 同时尝试旧字段 thumbnail 为 BLOB 的场景：无法直接删除文件，忽略
    }

    // 2) 删除与该资源相关的向量/文档（按文档ID前缀 `${resId}#` 约定生成）
    //    这里通过 LIKE 查询找出所有块文档的 ID，再调用 deleteVectors 做 vec_docs + documents 清理
    const docIds: string[] = [];
    for (const rid of allIdsToDelete) {
      const rows = await db
        .select({ id: documents.id })
        .from(documents)
        .where(like(documents.id, `${rid}#%`));
      for (const r of rows as any[]) docIds.push(r.id);
    }
    if (docIds.length) {
      try {
        deleteVectors(docIds);
      } catch (e) {
        console.log(e);
      }
    }

    // 3) 调试：查出引用待删除资源的相关数据并打印，便于决策
    const refTags = await db.select().from(resource_tags).where(inArray(resource_tags.resourceId, allIdsToDelete));
    const refDocs = await db.select({ id: documents.id, sourceId: documents.sourceId }).from(documents).where(inArray(documents.sourceId, allIdsToDelete));
    const refParent = await db
      .select({ id: resources.id, parentResourceId: resources.parentResourceId, title: resources.title })
      .from(resources)
      .where(inArray(resources.parentResourceId, allIdsToDelete));
    const refRssByRss = await db
      .select({ id: rss_feed_items.id, rssResourceId: rss_feed_items.rssResourceId, title: rss_feed_items.title })
      .from(rss_feed_items)
      .where(inArray(rss_feed_items.rssResourceId, allIdsToDelete));
    const refRssByLocal = await db
      .select({ id: rss_feed_items.id, localResourceId: rss_feed_items.localResourceId, title: rss_feed_items.title })
      .from(rss_feed_items)
      .where(inArray(rss_feed_items.localResourceId, allIdsToDelete));
    console.log('[deleteByIds] 待删除资源 ID 列表:', allIdsToDelete);
    console.log('[deleteByIds] 引用这些资源的 resource_tags 条数:', refTags.length, refTags.length ? refTags : '');
    console.log('[deleteByIds] 引用这些资源 sourceId 的 documents 条数:', refDocs.length, refDocs.length ? refDocs : '');
    console.log('[deleteByIds] 以这些资源为 parent 的 resources 条数:', refParent.length, refParent.length ? refParent : '');
    console.log('[deleteByIds] 引用这些资源 rssResourceId 的 rss_feed_items 条数:', refRssByRss.length, refRssByRss.length ? refRssByRss : '');
    console.log('[deleteByIds] 引用这些资源 localResourceId 的 rss_feed_items 条数:', refRssByLocal.length, refRssByLocal.length ? refRssByLocal : '');

    // 4) 在事务内先解除/删除所有引用 resources 的数据，再删除资源与回收站索引（避免外键约束失败）
    let changes = 0;
    (db as any).transaction((tx: any) => {
      // 先解除/删除所有引用待删 resource id 的数据，再删 resources，避免外键约束报错
      // FIXME: 资源是否不能被直接删除，因为有可能多个资源共用一个tag的，所以我认为资源tag不能和资源做强关联吧？
      tx.delete(resource_tags).where(inArray(resource_tags.resourceId, allIdsToDelete)).run?.();
      tx.update(documents).set({ sourceId: null }).where(inArray(documents.sourceId, allIdsToDelete)).run?.();
      tx.update(resources).set({ parentResourceId: null }).where(inArray(resources.parentResourceId, allIdsToDelete)).run?.();
      tx.delete(rss_feed_items).where(inArray(rss_feed_items.rssResourceId, allIdsToDelete)).run?.();
      tx.update(rss_feed_items).set({ localResourceId: null }).where(inArray(rss_feed_items.localResourceId, allIdsToDelete)).run?.();
      const res = tx.delete(resources).where(inArray(resources.id, allIdsToDelete)).run?.();
      changes = (res as any)?.changes ?? 0;
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, allIdsToDelete)).run?.();
    });

    // 5) 尝试删除磁盘上的实际文件与缩略图（容错，不影响主流程）
    const tryUnlink = async (p?: string): Promise<void> => {
      if (!p) return;
      try {
        if (fscb.existsSync(p)) await fs.unlink(p);
        // 若文件位于 .trash/<resourceId>/ 子目录，清理空目录
        const parentDir = path.dirname(p);
        if (parentDir.includes(`${path.sep}.trash${path.sep}`) || parentDir.includes('/.trash/')) {
          try {
            const remaining = await fs.readdir(parentDir);
            if (remaining.length === 0) await fs.rmdir(parentDir);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    };
    await Promise.all([...filePaths.map(tryUnlink), ...thumbPaths.map(tryUnlink)]);

    console.log(`[deleteByIds] 已删除 ${changes} 个资源（包含 ${childResIds.length} 个子资源）`);
    return changes;
  },
  /** 单条物理删除资源（便捷封装） */
  async deleteById(id: string): Promise<number> {
    return this.deleteByIds([id]);
  },
  /** 批量软删除资源：标记 deletedAt 并写入回收站索引，同时将物理文件移入 .trash/ 目录
   *  【级联删除】自动收集所有通过 parentResourceId 关联的子资源（翻译、摘要、脑图、笔记、片段、TTS 等）一并软删除，
   *  因为这些子资源由父资源派生，用户无法单独管理，应与父资源共享生命周期。
   */
  async softDelete(ids: string[]): Promise<ResourceRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    const now = Date.now();

    // 0) 级联收集所有子资源 ID（递归，不限类型——未来新增的子资源类型也自动覆盖）
    const allIds = new Set(ids);
    let frontier = [...ids];
    while (frontier.length) {
      const childRows = await db
        .select({ id: resources.id })
        .from(resources)
        .where(and(inArray(resources.parentResourceId, frontier), isNull(resources.deletedAt)));
      const next: string[] = [];
      for (const r of childRows as any[]) {
        if (r?.id && !allIds.has(r.id)) {
          allIds.add(r.id);
          next.push(r.id);
        }
      }
      frontier = next;
    }
    const expandedIds = Array.from(allIds);
    if (expandedIds.length > ids.length) {
      console.log(`[softDelete] 级联收集子资源: ${ids.length} → ${expandedIds.length} 个`);
    }

    // 1) 预取完整资源行（含 filePath、workspaceId），用于后续文件搬移
    const fullRows = await db.select().from(resources).where(inArray(resources.id, expandedIds));

    let resultRows: any[] = [];
    (db as any).transaction((tx: any) => {
      tx.update(resources).set({ deletedAt: now }).where(inArray(resources.id, expandedIds)).run?.();
      const rows =
        tx
          .select({ id: resources.id, title: resources.title, description: resources.description, contentText: resources.contentText })
          .from(resources)
          .where(inArray(resources.id, expandedIds))
          .all?.() ??
        tx.select({ id: resources.id, title: resources.title, description: resources.description, contentText: resources.contentText }).from(resources).where(inArray(resources.id, expandedIds));
      const items = (Array.isArray(rows) ? rows : []).map((r: any) => {
        const full = (fullRows as any[]).find((fr: any) => fr.id === r.id);
        return {
          id: `res:${r.id}`,
          entityType: 'resource',
          entityId: r.id,
          title: r.title ?? r.description ?? r.contentText?.slice(0, 80) ?? r.id,
          summary: r.description ?? r.contentText?.slice(0, 160) ?? null,
          reason: 'user-delete',
          deletedAt: now,
          deletedBy: 'system',
          payload: JSON.stringify({ id: r.id, originalFilePath: full?.filePath ?? null }),
          expireAt: null
        };
      });
      if (items.length) {
        tx.insert(recycle_bin)
          .values(items as any)
          .onConflictDoUpdate({
            target: recycle_bin.id,
            set: {
              deletedAt: sql`excluded.deleted_at`,
              payload: sql`excluded.payload`,
              title: sql`excluded.title`,
              summary: sql`excluded.summary`
            }
          })
          .run?.();
      }
      resultRows = tx.select().from(resources).where(inArray(resources.id, expandedIds)).all?.() ?? [];
    });

    // 2) 将物理文件移入 workspace 的 .trash/<resourceId>/ 目录，释放原文件名
    for (const row of fullRows as any[]) {
      if (!row.filePath || !row.workspaceId) continue;
      try {
        const ws = await WorkspacesRepo.getById(row.workspaceId);
        if (!ws?.rootPath) continue;
        const trashPath = await moveResourceFileToTrash(row.filePath, row.id, ws.rootPath);
        if (trashPath) {
          // 更新 DB 中的 filePath 指向 .trash/ 位置
          db.update(resources)
            .set({ filePath: trashPath } as any)
            .where(eq(resources.id, row.id))
            .run();
        }
      } catch (e) {
        console.warn('[softDelete] move file to trash failed for', row.id, e);
      }
    }

    // 3) 重新查询以获取更新后的 filePath
    resultRows = await db.select().from(resources).where(inArray(resources.id, expandedIds));
    return resultRows as any;
  },
  /** 批量恢复资源：清空 deletedAt 并删除回收站索引，同时将文件从 .trash/ 恢复至原位置
   *  【级联恢复】自动收集所有通过 parentResourceId 关联的已删除子资源一并恢复，
   *  与 softDelete 的级联删除对称，确保子资源与父资源共享生命周期。
   */
  async restore(ids: string[]): Promise<ResourceRow[]> {
    if (!ids.length) return [];
    const db = getOrm();

    // 0) 级联收集当前 ids 对应的所有已软删除子资源（递归）
    const allIds = new Set(ids);
    let frontier = [...ids];
    while (frontier.length) {
      const childRows = await db
        .select({ id: resources.id })
        .from(resources)
        .where(and(inArray(resources.parentResourceId, frontier), isNotNull(resources.deletedAt)));
      const next: string[] = [];
      for (const r of childRows as any[]) {
        if (r?.id && !allIds.has(r.id)) {
          allIds.add(r.id);
          next.push(r.id);
        }
      }
      frontier = next;
    }
    const expandedIds = Array.from(allIds);
    if (expandedIds.length > ids.length) {
      console.log(`[restore] 级联收集子资源: ${ids.length} → ${expandedIds.length} 个`);
    }

    // 1) 预取 recycle_bin 条目以获取原始文件路径
    const recycleBinEntries = await db.select().from(recycle_bin).where(inArray(recycle_bin.entityId, expandedIds));
    const originalPathMap = new Map<string, string>();
    for (const entry of recycleBinEntries as any[]) {
      try {
        const payload = JSON.parse(entry.payload || '{}');
        if (payload.originalFilePath) {
          originalPathMap.set(entry.entityId, payload.originalFilePath);
        }
      } catch {
        /* ignore */
      }
    }

    // 2) 预取当前资源行以获取当前 filePath（可能在 .trash/ 中）
    const currentRows = await db.select().from(resources).where(inArray(resources.id, expandedIds));

    let rows: any[] = [];
    (db as any).transaction((tx: any) => {
      tx.update(resources).set({ deletedAt: null, updatedAt: Date.now() }).where(inArray(resources.id, expandedIds)).run?.();
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, expandedIds)).run?.();
      rows = tx.select().from(resources).where(inArray(resources.id, expandedIds)).all?.() ?? [];
    });

    // 3) 将文件从 .trash/ 恢复至原始位置
    for (const row of currentRows as any[]) {
      const originalPath = originalPathMap.get(row.id);
      if (!row.filePath || !originalPath) continue;
      // 仅当文件确实在 .trash/ 目录中才恢复
      if (!row.filePath.includes(`${path.sep}.trash${path.sep}`) && !row.filePath.includes('/.trash/')) continue;
      try {
        const restoredPath = await restoreResourceFileFromTrash(row.filePath, originalPath, row.id);
        if (restoredPath && restoredPath !== row.filePath) {
          db.update(resources)
            .set({ filePath: restoredPath } as any)
            .where(eq(resources.id, row.id))
            .run();
        }
      } catch (e) {
        console.warn('[restore] restore file from trash failed for', row.id, e);
      }
    }

    // 4) 重新查询以获取更新后的 filePath
    rows = await db.select().from(resources).where(inArray(resources.id, expandedIds));
    return rows as any;
  },
  /** 基础列表与计数（含软删筛选） */
  async list(filter: Partial<ResourceRow> = {}, limit = 2000, offset = 0): Promise<ResourceRow[]> {
    const db = getOrm();
    // 优化：列表查询排除大字段 (contentText, thumbnail, embedding, metadata)
    let query = db
      .select({
        id: resources.id,
        type: resources.type,
        title: resources.title,
        description: resources.description,
        url: resources.url,
        domain: resources.domain,
        sourceName: resources.sourceName,
        authorName: resources.authorName,
        language: resources.language,
        mimeType: resources.mimeType,
        sizeBytes: resources.sizeBytes,
        durationMs: resources.durationMs,
        width: resources.width,
        height: resources.height,
        filePath: resources.filePath,
        thumbnailPath: resources.thumbnailPath,
        previewUrl: resources.previewUrl,
        tags: resources.tags,
        categories: resources.categories,
        visibility: resources.visibility,
        nsfw: resources.nsfw,
        favorite: resources.favorite,
        rating: resources.rating,
        status: resources.status,
        collectedAt: resources.collectedAt,
        publishedAt: resources.publishedAt,
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
        deletedAt: resources.deletedAt,
        workspaceId: resources.workspaceId,
        folderId: resources.folderId,
        parentResourceId: resources.parentResourceId
      })
      .from(resources);
    const wheres: any[] = [];
    if ((filter as any).type) wheres.push(eq(resources.type, (filter as any).type));
    if ((filter as any).status) wheres.push(eq(resources.status, (filter as any).status));
    if ((filter as any).visibility) wheres.push(eq(resources.visibility, (filter as any).visibility));
    if ((filter as any).tags) wheres.push(like(resources.tags, `%${(filter as any).tags}%`));
    if ((filter as any).workspaceId) wheres.push(eq(resources.workspaceId, (filter as any).workspaceId));
    if ((filter as any).folderId !== undefined) {
      if ((filter as any).folderId === null) {
        wheres.push(isNull(resources.folderId));
      } else {
        wheres.push(eq(resources.folderId, (filter as any).folderId));
      }
    }
    if ((filter as any).parentResourceId !== undefined) {
      if ((filter as any).parentResourceId === null) {
        wheres.push(isNull(resources.parentResourceId));
      } else {
        wheres.push(eq(resources.parentResourceId, (filter as any).parentResourceId));
      }
    }
    if ((filter as any).deletedAt === 0) wheres.push(isNull(resources.deletedAt));
    if ((filter as any).deletedAt === 1) wheres.push(isNotNull(resources.deletedAt));
    if (wheres.length) query = query.where(and(...wheres));
    // 按收集时间降序排序，新资源在前面
    return query.orderBy(desc(resources.collectedAt)).limit(limit).offset(offset) as any;
  },
  async count(filter: Partial<ResourceRow> = {}): Promise<number> {
    const db = getOrm();
    let query = db.select({ count: resources.id }).from(resources);
    const wheres: any[] = [];
    if ((filter as any).type) wheres.push(eq(resources.type, (filter as any).type));
    if ((filter as any).status) wheres.push(eq(resources.status, (filter as any).status));
    if ((filter as any).visibility) wheres.push(eq(resources.visibility, (filter as any).visibility));
    if ((filter as any).workspaceId) wheres.push(eq(resources.workspaceId, (filter as any).workspaceId));
    if ((filter as any).folderId !== undefined) {
      if ((filter as any).folderId === null) {
        wheres.push(isNull(resources.folderId));
      } else {
        wheres.push(eq(resources.folderId, (filter as any).folderId));
      }
    }
    if ((filter as any).deletedAt === 0) wheres.push(isNull(resources.deletedAt));
    if ((filter as any).deletedAt === 1) wheres.push(isNotNull(resources.deletedAt));
    if (wheres.length) query = query.where(and(...wheres));
    const rows = await query;
    return rows[0]?.count ?? 0;
  },
  /** 查询某个资源的所有子资源（通过parentResourceId） */
  async listChildren(parentResourceId: string, limit = 100, offset = 0): Promise<ResourceRow[]> {
    return this.list({ parentResourceId } as any, limit, offset);
  },
  /** 获取资源的父资源信息 */
  async getParent(resourceId: string): Promise<ResourceRow | undefined> {
    const resource = await this.getById(resourceId);
    if (!resource?.parentResourceId) return undefined;
    return this.getById(resource.parentResourceId);
  }
};

/** 标签归一化表操作 */
export const TagsRepo = {
  /** 替换某资源的标签集合（先清空再插入） */
  async replaceForResource(resourceId: string, workspaceId: string | null, tags: string[]): Promise<number> {
    const db = getOrm();
    // 规范化与去重：
    // 1) 去前后空格；
    // 2) 按不区分大小写去重（'AI' 与 'ai' 视为同一标签）；
    // 3) 若工作空间内已存在同名（不区分大小写）的标签，沿用已存在的字符串形式，避免产生新的变体。
    const raw = Array.isArray(tags) ? tags : [];
    const cleaned = raw.map((t) => String(t || '').trim()).filter(Boolean);

    // 构建目标 key 集合（小写）
    const targetKeys = Array.from(new Set(cleaned.map((t) => t.toLowerCase())));

    // 查询工作空间（或全局）中已存在的同名标签（不区分大小写），用于复用其字符串形式
    // 这里用 listAll 获取已存在的聚合标签，再做小写映射到原字符串
    // 注意：listAll 仅统计未软删资源的标签，足以作为“已被使用的规范形式”的参考
    const existingMap = new Map<string, string>();
    try {
      const existed = await this.listAll(workspaceId || undefined);
      for (const row of existed) {
        const k = (row.tag || '').toLowerCase();
        if (k && !existingMap.has(k)) existingMap.set(k, row.tag);
      }
    } catch {
      // 忽略统计失败，继续以本次传入的标签为准
    }

    // 生成去重后的最终标签列表：优先采用已存在的字符串形式，否则使用本次传入的首个变体
    const seen = new Set<string>();
    const finalTags: string[] = [];
    for (const key of targetKeys) {
      if (seen.has(key)) continue;
      seen.add(key);
      // 找到本次传入中第一个匹配该 key 的原始标签（用于保持用户输入的形式作为后备）
      const fallback = cleaned.find((t) => t.toLowerCase() === key) || key;
      const canonical = existingMap.get(key) || fallback;
      finalTags.push(canonical);
    }

    let inserted = 0;
    (db as any).transaction((tx: any) => {
      // 先清空旧有关系
      tx.delete(resource_tags).where(eq(resource_tags.resourceId, resourceId)).run?.();
      // 再按去重后的集合写入新关系
      const values = finalTags.map((t) => ({ resourceId, workspaceId, tag: t }) as any);
      if (values.length) {
        tx.insert(resource_tags).values(values).onConflictDoNothing?.().run?.();
        inserted = values.length;
      }
    });
    return inserted;
  },
  /** 聚合列出标签及数量（可选按工作空间过滤） */
  async listAll(workspaceId?: string): Promise<Array<{ tag: string; count: number }>> {
    const db = getOrm();
    // 仅统计未软删的资源标签
    let q = db
      .select({ tag: resource_tags.tag, count: sql<number>`count(*)`.as('count') })
      .from(resource_tags)
      .innerJoin(resources, eq(resource_tags.resourceId, resources.id));
    const wheres: any[] = [isNull(resources.deletedAt)];
    if (workspaceId) wheres.push(eq(resource_tags.workspaceId, workspaceId));
    q = (q as any).where(and(...wheres));
    const rows = await (q as any).groupBy(resource_tags.tag);
    // drizzle 返回的 count 字段类型可能是 bigint/number 字符串，这里标准化为 number
    return (rows as any[]).map((r) => ({ tag: r.tag as string, count: Number((r as any).count) }));
  },
  /**
   * 从 resources.tags 反向填充归一化标签表（默认仅处理未软删资源）
   * @param workspaceId 可选工作空间，仅回填该空间下资源
   * @returns 处理的资源数量
   */
  async backfillFromResources(workspaceId?: string): Promise<number> {
    const db = getOrm();
    let q = db.select().from(resources).where(isNull(resources.deletedAt));
    if (workspaceId) q = (q as any).where(and(isNull(resources.deletedAt), eq(resources.workspaceId, workspaceId)));
    const rows = (await q) as any[];
    let processed = 0;
    for (const r of rows) {
      const tags = safeParseTags(r.tags);
      if (Array.isArray(tags)) {
        try {
          await this.replaceForResource(r.id, r.workspaceId || null, tags);
          processed += 1;
        } catch {
          /* ignore individual failures */
        }
      }
    }
    return processed;
  }
};

function safeParseTags(v: unknown): string[] | null {
  try {
    if (Array.isArray(v)) return (v as any).map((s: any) => String(s)).filter(Boolean);
    if (typeof v === 'string') {
      const json = JSON.parse(v);
      return Array.isArray(json) ? json.map((s) => String(s)).filter(Boolean) : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 文件夹表操作空间
 * - 支持 upsert、批量 upsert、查询、软删/恢复、重命名、移动（变更 parentId）
 */
export const FoldersRepo = {
  /** 新增文件夹（自动生成 rank） */
  async create(folder: NewFolder): Promise<FolderRow> {
    const db = getOrm();

    // 1. 查找同级目录下最大的 rank
    const lastFolder = await db
      .select({ rank: folders.rank })
      .from(folders)
      .where(folder.parentId ? eq(folders.parentId, folder.parentId) : isNull(folders.parentId))
      .orderBy(desc(folders.rank))
      .limit(1);

    const maxRank = lastFolder[0]?.rank ?? 0;
    // 2. 新 rank = 最大 rank + 65536
    const newRank = (maxRank || 0) + 65536;

    const rows = await db
      .insert(folders)
      .values({ ...folder, rank: newRank } as any)
      .returning()
      .all();
    return rows[0];
  },
  /** 新增或更新文件夹（同 ID 冲突时更新） */
  async upsert(folder: NewFolder): Promise<FolderRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(folders)
      .values(folder as any)
      .onConflictDoUpdate({ target: folders.id, set: omitId(folder as any) })
      .returning()
      .all();
    return rows[0];
  },
  /** 批量 upsert 文件夹 */
  async bulkUpsert(list: NewFolder[]): Promise<FolderRow[]> {
    if (!list.length) return [];
    const db = getOrm();
    const rows = await db
      .insert(folders)
      .values(list as any)
      .onConflictDoUpdate({ target: folders.id, set: omitId((list[0] as any) || {}) })
      .returning()
      .all();
    return rows;
  },
  /** 按 ID 获取 */
  async getById(id: string): Promise<FolderRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return rows[0];
  },
  /** 列表（按父级、工作空间等筛选） */
  async list(filter: Partial<FolderRow> = {}, limit = 100, offset = 0): Promise<FolderRow[]> {
    const db = getOrm();
    const rawDb = getDB();

    // 如果查询未删除的文件夹，需要排除那些父级（或任何祖先）已被删除的文件夹
    if ((filter as any).deletedAt === 0 && rawDb) {
      // 使用递归 CTE 找到所有已删除的文件夹及其所有子文件夹
      const deletedFolderIds = rawDb
        .prepare(
          `
          WITH RECURSIVE deleted_folders AS (
            SELECT id FROM folders WHERE deleted_at IS NOT NULL
            UNION
            SELECT f.id
            FROM folders f
            INNER JOIN deleted_folders df ON f.parent_id = df.id
          )
          SELECT id FROM deleted_folders
        `
        )
        .all() as Array<{ id: string }>;

      const deletedIds = deletedFolderIds.map((row) => row.id);

      // 使用 drizzle-orm 查询构建器，但排除已删除的文件夹及其子文件夹
      let query = db.select().from(folders);
      const wheres: any[] = [];

      // 确保文件夹本身未删除
      wheres.push(isNull(folders.deletedAt));

      if ((filter as any).workspaceId) wheres.push(eq(folders.workspaceId, (filter as any).workspaceId));
      if ((filter as any).parentId === null) wheres.push(isNull(folders.parentId));
      if ((filter as any).parentId) wheres.push(eq(folders.parentId, (filter as any).parentId));

      // 排除已删除的文件夹及其子文件夹
      if (deletedIds.length > 0) {
        // 使用 sql 模板构建 NOT IN 条件，将每个 ID 作为字符串字面量
        const idValues = deletedIds.map((id) => sql`${id}`);
        const notInCondition = sql`${folders.id} NOT IN (${sql.join(idValues, sql`, `)})`;
        wheres.push(notInCondition);
      }

      if (wheres.length) {
        query = query.where(and(...wheres));
      }
      return query.orderBy(asc(folders.rank), desc(folders.createdAt)).limit(limit).offset(offset);
    }

    // 其他情况使用原来的逻辑
    let query = db.select().from(folders);
    const wheres: any[] = [];
    if ((filter as any).workspaceId) wheres.push(eq(folders.workspaceId, (filter as any).workspaceId));
    if ((filter as any).parentId === null) wheres.push(isNull(folders.parentId));
    if ((filter as any).parentId) wheres.push(eq(folders.parentId, (filter as any).parentId));
    if ((filter as any).deletedAt === 0) wheres.push(isNull(folders.deletedAt));
    if ((filter as any).deletedAt === 1) wheres.push(isNotNull(folders.deletedAt));
    if (wheres.length) query = query.where(and(...wheres));
    return query.orderBy(asc(folders.rank), desc(folders.createdAt)).limit(limit).offset(offset);
  },
  /** 计数 */
  async count(filter: Partial<FolderRow> = {}): Promise<number> {
    const db = getOrm();
    const rawDb = getDB();

    // 如果查询未删除的文件夹，需要排除那些父级（或任何祖先）已被删除的文件夹
    if ((filter as any).deletedAt === 0 && rawDb) {
      // 使用递归 CTE 找到所有已删除的文件夹及其所有子文件夹
      const deletedFolderIds = rawDb
        .prepare(
          `
          WITH RECURSIVE deleted_folders AS (
            SELECT id FROM folders WHERE deleted_at IS NOT NULL
            UNION
            SELECT f.id
            FROM folders f
            INNER JOIN deleted_folders df ON f.parent_id = df.id
          )
          SELECT id FROM deleted_folders
        `
        )
        .all() as Array<{ id: string }>;

      const deletedIds = deletedFolderIds.map((row) => row.id);

      // 使用 drizzle-orm 查询构建器，但排除已删除的文件夹及其子文件夹
      let query = db.select({ count: folders.id }).from(folders);
      const wheres: any[] = [];

      // 确保文件夹本身未删除
      wheres.push(isNull(folders.deletedAt));

      if ((filter as any).workspaceId) wheres.push(eq(folders.workspaceId, (filter as any).workspaceId));
      if ((filter as any).parentId === null) wheres.push(isNull(folders.parentId));
      if ((filter as any).parentId) wheres.push(eq(folders.parentId, (filter as any).parentId));

      // 排除已删除的文件夹及其子文件夹
      if (deletedIds.length > 0) {
        // 使用 sql 模板构建 NOT IN 条件，将每个 ID 作为字符串字面量
        const idValues = deletedIds.map((id) => sql`${id}`);
        const notInCondition = sql`${folders.id} NOT IN (${sql.join(idValues, sql`, `)})`;
        wheres.push(notInCondition);
      }

      if (wheres.length) {
        query = query.where(and(...wheres));
      }
      const rows = await query;
      return rows[0]?.count ?? 0;
    }

    // 其他情况使用原来的逻辑
    let query = db.select({ count: folders.id }).from(folders);
    const wheres: any[] = [];
    if ((filter as any).workspaceId) wheres.push(eq(folders.workspaceId, (filter as any).workspaceId));
    if ((filter as any).parentId === null) wheres.push(isNull(folders.parentId));
    if ((filter as any).parentId) wheres.push(eq(folders.parentId, (filter as any).parentId));
    if ((filter as any).deletedAt === 0) wheres.push(isNull(folders.deletedAt));
    if ((filter as any).deletedAt === 1) wheres.push(isNotNull(folders.deletedAt));
    if (wheres.length) query = query.where(and(...wheres));
    const rows = await query;
    return rows[0]?.count ?? 0;
  },
  /** 重命名 */
  async rename(id: string, newName: string): Promise<FolderRow | undefined> {
    const db = getOrm();
    await db
      .update(folders)
      .set({ name: newName, updatedAt: Date.now() } as any)
      .where(eq(folders.id, id))
      .run();
    const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return rows[0];
  },
  /** 移动到新父目录（支持置空为根） */
  async move(id: string, newParentId: string | null, prevRank?: number, nextRank?: number): Promise<FolderRow | undefined> {
    const db = getOrm();

    let newRank: number;

    if (prevRank === undefined && nextRank === undefined) {
      // 如果没传 rank，保持原样或放到最后（视业务逻辑而定）
      // 这里假设放到最后，逻辑同 create
      const lastFolder = await db
        .select({ rank: folders.rank })
        .from(folders)
        .where(newParentId ? eq(folders.parentId, newParentId) : isNull(folders.parentId))
        .orderBy(desc(folders.rank))
        .limit(1);
      newRank = (lastFolder[0]?.rank ?? 0) + 65536;
    } else {
      // 核心算法：取中间值
      const prev = prevRank ?? 0; // 如果没有上一个，视为 0
      const next = nextRank; // 如果没有下一个，说明是追加到末尾

      if (next === undefined || next === null) {
        // 拖拽到最后：上一个 + 间隔
        newRank = prev + 65536;
      } else {
        // 拖拽到中间：(上一个 + 下一个) / 2
        newRank = (prev + next) / 2;
      }
    }

    await db
      .update(folders)
      .set({ parentId: newParentId, rank: newRank, updatedAt: Date.now() } as any)
      .where(eq(folders.id, id))
      .run();
    const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return rows[0];
  },
  /** 软删除 */
  async softDelete(ids: string[]): Promise<FolderRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    await db
      .update(folders)
      .set({ deletedAt: Date.now() } as any)
      .where(inArray(folders.id, ids))
      .run();
    return await db.select().from(folders).where(inArray(folders.id, ids));
  },
  /** 恢复 */
  async restore(ids: string[]): Promise<FolderRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    await db
      .update(folders)
      .set({ deletedAt: null, updatedAt: Date.now() } as any)
      .where(inArray(folders.id, ids))
      .run();
    return await db.select().from(folders).where(inArray(folders.id, ids));
  },
  /** 物理删除（谨慎） */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(folders).where(inArray(folders.id, ids)).run();
    return (res as any).changes ?? 0;
  }
};

/**
 * 工作空间表操作空间
 * - 负责增删改查、默认空间设置、软删/恢复
 */
export const WorkspacesRepo = {
  /** 新增或更新工作空间 */
  async upsert(ws: NewWorkspace): Promise<WorkspaceRow | undefined> {
    const db = getOrm();
    const rows = await db
      .insert(workspaces)
      .values(ws as any)
      .onConflictDoUpdate({ target: workspaces.id, set: omitId(ws as any) })
      .returning()
      .all();
    return rows[0];
  },
  /** 按ID获取 */
  async getById(id: string): Promise<WorkspaceRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return rows[0];
  },
  /** 获取默认工作空间 */
  async getDefault(): Promise<WorkspaceRow | undefined> {
    const db = getOrm();
    const rows = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.isDefault as any, 1), isNull(workspaces.deletedAt)) as any)
      .limit(1);
    return rows[0];
  },
  /** 设置默认空间（应用层确保唯一） */
  async setDefault(id: string): Promise<WorkspaceRow | undefined> {
    const db = getOrm();
    const now = Date.now();
    // Drizzle (better-sqlite3) transactions must be synchronous. The callback
    // cannot be async or return a Promise, otherwise you'll see:
    // "Transaction function cannot return a promise".
    (db as any).transaction((tx: any) => {
      // 1) 清除旧默认（只更新当前为默认的行，避免全表无谓写放大）
      tx.update(workspaces)
        .set({ isDefault: 0 as any, updatedAt: now })
        .where(eq(workspaces.isDefault as any, 1))
        .run?.();
      // 2) 设定新默认
      tx.update(workspaces)
        .set({ isDefault: 1 as any, updatedAt: now })
        .where(eq(workspaces.id, id))
        .run?.();
    });
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return rows[0];
  },
  /** 列表（支持按软删过滤） */
  async list(filter: Partial<WorkspaceRow> = {}, limit = 100, offset = 0): Promise<WorkspaceRow[]> {
    const db = getOrm();
    let query = db.select().from(workspaces);
    const wheres: any[] = [];
    if ((filter as any).status) wheres.push(eq(workspaces.status as any, (filter as any).status));
    if ((filter as any).deletedAt === 0) wheres.push(isNull(workspaces.deletedAt));
    if ((filter as any).deletedAt === 1) wheres.push(isNotNull(workspaces.deletedAt));
    if (wheres.length) query = query.where(and(...wheres));
    return query.limit(limit).offset(offset);
  },
  async count(filter: Partial<WorkspaceRow> = {}): Promise<number> {
    const db = getOrm();
    let query = db.select({ count: workspaces.id }).from(workspaces);
    const wheres: any[] = [];
    if ((filter as any).status) wheres.push(eq(workspaces.status as any, (filter as any).status));
    if ((filter as any).deletedAt === 0) wheres.push(isNull(workspaces.deletedAt));
    if ((filter as any).deletedAt === 1) wheres.push(isNotNull(workspaces.deletedAt));
    if (wheres.length) query = query.where(and(...wheres));
    const rows = await query;
    return rows[0]?.count ?? 0;
  },
  /** 更新 */
  async update(id: string, patch: Partial<NewWorkspace>): Promise<WorkspaceRow | undefined> {
    const db = getOrm();
    await db
      .update(workspaces)
      .set({ ...patch, updatedAt: Date.now() } as any)
      .where(eq(workspaces.id, id))
      .run();
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return rows[0];
  },
  /** 软删 */
  async softDelete(ids: string[]): Promise<WorkspaceRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    await db.update(workspaces).set({ deletedAt: Date.now() }).where(inArray(workspaces.id, ids)).run();
    return await db.select().from(workspaces).where(inArray(workspaces.id, ids));
  },
  /** 物理删除 */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(workspaces).where(inArray(workspaces.id, ids)).run();
    return (res as any).changes ?? 0;
  }
};

/**
 * 会话与消息表操作空间
 */
export const ChatRepo = {
  /**
   * 确保会话存在；若传入 conversationId 则返回该会话（若存在），否则新建
   */
  async ensureConversation(payload: Partial<NewConversation> & { id?: string }): Promise<ConversationRow> {
    const db = getOrm();
    const id = payload.id;
    if (id) {
      const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
      if (rows[0]) return rows[0];
    }
    const now = Date.now();
    const values: any = {
      title: payload.title ?? null,
      workspaceId: payload.workspaceId ?? null,
      agentId: payload.agentId ?? null,
      providerId: payload.providerId ?? null,
      providerInstanceId: payload.providerInstanceId ?? null,
      messagesCount: 0,
      lastMessageAt: now,
      pinned: payload.pinned ?? 0,
      metadata: payload.metadata ?? null,
      createdAt: now,
      updatedAt: now
    };
    if (id) values.id = id;
    const rows = await db.insert(conversations).values(values).returning().all();
    return rows[0];
  },

  /**
   * 新增一条消息，自动维护 seq、会话计数与 lastMessageAt
   */
  async addMessage(conversationId: string, message: Omit<NewChatMessage, 'id' | 'conversationId' | 'seq'>): Promise<ChatMessageRow> {
    const db = getOrm();
    // 计算下一个 seq
    const seqRow = (
      await db
        .select({ m: max(chat_messages.seq).as('max') })
        .from(chat_messages)
        .where(eq(chat_messages.conversationId, conversationId))
    )[0] as any;
    const nextSeq = (seqRow?.m ?? 0) + 1;
    const now = Date.now();
    const rows = await db
      .insert(chat_messages)
      .values({
        conversationId,
        role: message.role,
        content: message.content,
        name: message.name ?? null,
        toolCallId: message.toolCallId ?? null,
        metadata: message.metadata ?? null,
        seq: nextSeq,
        createdAt: (message as any).createdAt ?? now,
        updatedAt: now
      } as any)
      .returning()
      .all();

    // 更新会话计数与时间
    // Title generation is now handled by the renderer after the first AI reply completes
    const conv = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    const prevCount = conv[0]?.messagesCount ?? 0;
    const countVal = prevCount + 1;
    const patch: any = { messagesCount: countVal, lastMessageAt: now, updatedAt: now };
    await db.update(conversations).set(patch).where(eq(conversations.id, conversationId)).run();
    return rows[0];
  },

  async listConversations(filter: { includeDeleted?: boolean } = {}, limit = 100, offset = 0): Promise<ConversationRow[]> {
    const db = getOrm();
    let q = db.select().from(conversations);
    const wheres: any[] = [];
    if (!filter.includeDeleted) wheres.push(isNull(conversations.deletedAt));
    if (wheres.length) q = q.where(and(...wheres));
    return q
      .orderBy(desc(conversations.pinned as any), desc(conversations.lastMessageAt as any), desc(conversations.updatedAt as any))
      .limit(limit)
      .offset(offset);
  },

  async listMessages(conversationId: string, limit = 1000, offset = 0): Promise<ChatMessageRow[]> {
    const db = getOrm();
    return db
      .select()
      .from(chat_messages)
      .where(and(eq(chat_messages.conversationId, conversationId), isNull(chat_messages.deletedAt)))
      .orderBy(chat_messages.seq as any)
      .limit(limit)
      .offset(offset);
  },

  async renameConversation(id: string, title: string): Promise<ConversationRow | undefined> {
    const db = getOrm();
    const now = Date.now();
    await db
      .update(conversations)
      .set({ title, updatedAt: now } as any)
      .where(eq(conversations.id, id))
      .run();
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  },

  async softDeleteConversation(id: string): Promise<ConversationRow | undefined> {
    const db = getOrm();
    const now = Date.now();
    await db
      .update(conversations)
      .set({ deletedAt: now, updatedAt: now } as any)
      .where(eq(conversations.id, id))
      .run();
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  },

  /** 恢复会话（清空 deletedAt） */
  async restoreConversation(id: string): Promise<ConversationRow | undefined> {
    const db = getOrm();
    const now = Date.now();
    await db
      .update(conversations)
      .set({ deletedAt: null, updatedAt: now } as any)
      .where(eq(conversations.id, id))
      .run();
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  },

  /** 物理删除会话（及其消息）并清理回收站索引 */
  async deleteConversations(ids: string[]): Promise<number> {
    if (!ids?.length) return 0;
    const db = getOrm();
    // Drizzle doesn't expose chat_messages table here for delete cascade because FK already has ON DELETE CASCADE.
    // Delete conversations; FK should cascade to messages. Also cleanup recycle_bin.
    let deleted = 0;
    (db as any).transaction((tx: any) => {
      const res = tx.delete(conversations).where(inArray(conversations.id, ids)).run?.();
      deleted = (res as any)?.changes ?? 0;
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids)).run?.();
    });
    return deleted;
  }
};

export const AutomationRulesRepo = {
  async list(): Promise<AutomationRuleRow[]> {
    const db = getOrm();
    return db.select().from(automation_rules).all();
  },
  async getById(id: string): Promise<AutomationRuleRow | undefined> {
    const db = getOrm();
    const rows = await db.select().from(automation_rules).where(eq(automation_rules.id, id)).limit(1);
    return rows[0];
  },
  async create(rule: NewAutomationRule): Promise<AutomationRuleRow> {
    const db = getOrm();
    const rows = await db.insert(automation_rules).values(rule).returning().all();
    return rows[0];
  },
  async update(id: string, patch: Partial<NewAutomationRule>): Promise<AutomationRuleRow | undefined> {
    const db = getOrm();
    await db
      .update(automation_rules)
      .set({ ...patch, updatedAt: Date.now() } as any)
      .where(eq(automation_rules.id, id))
      .run();
    return this.getById(id);
  },
  async delete(id: string): Promise<void> {
    const db = getOrm();
    await db.delete(automation_rules).where(eq(automation_rules.id, id)).run();
  },
  async findByEvent(resourceType: string, eventType: string, workspaceId?: string, folderId?: string): Promise<AutomationRuleRow[]> {
    const db = getOrm();
    // Query all enabled rules with triggerType 'resource_event'
    // Then filter in memory or use JSON operators if available (but standard sqlite json support varies in drizzle)
    // For simplicity and compatibility, we fetch candidates and filter.

    const candidates = await db
      .select()
      .from(automation_rules)
      .where(and(eq(automation_rules.enabled, 1), eq(automation_rules.triggerType, 'resource_event')))
      .all();

    return candidates.filter((rule: AutomationRuleRow) => {
      // 1. Check Scope
      if (rule.scope === 'workspace') {
        if (rule.workspaceId && rule.workspaceId !== workspaceId) return false;
      }

      // 2. Check Trigger Config
      const config = rule.triggerConfig as any;
      if (!config) return false;

      // Check Folder Scope (if defined in trigger config)
      if (config.folderId) {
        // If rule is scoped to a folder, the event must happen in that folder (or subfolder? for now exact match)
        // If event has no folderId, it doesn't match
        if (!folderId || config.folderId !== folderId) return false;
      }

      // Check Event Type (e.g. 'created', 'updated')
      // Map legacy eventType to new config event if needed, or assume config uses 'created'/'updated'
      // eventType passed here is 'resource_created' or 'resource_updated'
      // Let's assume config.event stores 'created' or 'updated' (without 'resource_' prefix) or full string.
      // Let's standardize: config.event = 'created' | 'updated'
      const targetEvent = eventType.replace('resource_', '');
      if (config.event !== targetEvent) return false;

      // Check Resource Type (e.g. 'video', 'all')
      if (config.resourceType !== 'all' && config.resourceType !== resourceType) return false;

      return true;
    });
  },
  async findBySystemEvent(eventType: string): Promise<AutomationRuleRow[]> {
    const db = getOrm();
    const candidates = await db
      .select()
      .from(automation_rules)
      .where(and(eq(automation_rules.enabled, 1), eq(automation_rules.triggerType, 'system_event')))
      .all();

    return candidates.filter((rule: AutomationRuleRow) => {
      const config = rule.triggerConfig as any;
      if (!config) return false;
      return config.event === eventType;
    });
  }
};

/**
 * RSS Feed 条目缓存表操作空间
 * - 支持批量 upsert、按资源 ID 查询、增量更新、清理等
 */
export const RssFeedItemsRepo = {
  /**
   * 批量新增或更新条目（基于 rssResourceId + itemId 唯一约束）
   * @param items 条目列表
   */
  async bulkUpsert(items: NewRssFeedItem[]): Promise<RssFeedItemRow[]> {
    if (!items.length) return [];
    const db = getOrm();
    const rows = await db
      .insert(rss_feed_items)
      .values(items as any)
      .onConflictDoUpdate({
        target: [rss_feed_items.rssResourceId, rss_feed_items.itemId],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          link: sql`excluded.link`,
          publishedAt: sql`excluded.published_at`,
          updatedAt: sql`excluded.updated_at`,
          author: sql`excluded.author`,
          thumbnail: sql`excluded.thumbnail`,
          durationMs: sql`excluded.duration_ms`,
          viewCount: sql`excluded.view_count`,
          likeCount: sql`excluded.like_count`,
          commentCount: sql`excluded.comment_count`,
          mediaType: sql`excluded.media_type`,
          mediaUrl: sql`excluded.media_url`,
          mediaFormat: sql`excluded.media_format`,
          sizeBytes: sql`excluded.size_bytes`,
          categories: sql`excluded.categories`,
          metadata: sql`excluded.metadata`
        }
      })
      .returning()
      .all();
    return rows;
  },

  /**
   * 按 RSS 资源 ID 获取缓存的条目列表（按发布时间倒序）
   * @param rssResourceId RSS 资源 ID
   * @param limit 限制数量
   * @param offset 偏移量
   */
  async listByResourceId(rssResourceId: string, limit = 100, offset = 0): Promise<RssFeedItemRow[]> {
    const db = getOrm();
    return db
      .select()
      .from(rss_feed_items)
      .where(and(eq(rss_feed_items.rssResourceId, rssResourceId), isNull(rss_feed_items.deletedAt)))
      .orderBy(desc(rss_feed_items.publishedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * 统计某 RSS 资源下的条目数量
   * @param rssResourceId RSS 资源 ID
   */
  async countByResourceId(rssResourceId: string): Promise<number> {
    const db = getOrm();
    const rows = await db
      .select({ count: rss_feed_items.id })
      .from(rss_feed_items)
      .where(and(eq(rss_feed_items.rssResourceId, rssResourceId), isNull(rss_feed_items.deletedAt)));
    return rows[0]?.count ?? 0;
  },

  /**
   * 获取某 RSS 资源下最新的条目 ID
   * @param rssResourceId RSS 资源 ID
   */
  async getLatestItemId(rssResourceId: string): Promise<string | null> {
    const db = getOrm();
    const rows = await db
      .select({ itemId: rss_feed_items.itemId })
      .from(rss_feed_items)
      .where(and(eq(rss_feed_items.rssResourceId, rssResourceId), isNull(rss_feed_items.deletedAt)))
      .orderBy(desc(rss_feed_items.publishedAt))
      .limit(1);
    return rows[0]?.itemId ?? null;
  },

  /**
   * 更新条目的下载状态
   * @param rssResourceId RSS 资源 ID
   * @param itemId 条目 ID（来源平台的 ID）
   * @param patch 更新字段
   */
  async updateDownloadStatus(
    rssResourceId: string,
    itemId: string,
    patch: { downloaded?: boolean; localResourceId?: string | null; downloadStatus?: string; downloadProgress?: number }
  ): Promise<RssFeedItemRow | undefined> {
    const db = getOrm();
    await db
      .update(rss_feed_items)
      .set(patch as any)
      .where(and(eq(rss_feed_items.rssResourceId, rssResourceId), eq(rss_feed_items.itemId, itemId)))
      .run();
    const rows = await db
      .select()
      .from(rss_feed_items)
      .where(and(eq(rss_feed_items.rssResourceId, rssResourceId), eq(rss_feed_items.itemId, itemId)))
      .limit(1);
    return rows[0];
  },

  /**
   * 批量更新条目的下载状态（根据已下载的本地资源）
   * @param rssResourceId RSS 资源 ID
   * @param downloadedItemIds 已下载的条目 ID 列表
   * @param localResourceMap 条目 ID 到本地资源 ID 的映射
   */
  async batchUpdateDownloadStatus(rssResourceId: string, downloadedItemIds: string[], localResourceMap: Map<string, string>): Promise<void> {
    if (!downloadedItemIds.length) return;
    const db = getOrm();
    for (const itemId of downloadedItemIds) {
      const localResourceId = localResourceMap.get(itemId);
      await db
        .update(rss_feed_items)
        .set({ downloaded: true, localResourceId, downloadStatus: 'completed' } as any)
        .where(and(eq(rss_feed_items.rssResourceId, rssResourceId), eq(rss_feed_items.itemId, itemId)))
        .run();
    }
  },

  /**
   * 删除某 RSS 资源下的所有条目（物理删除）
   * @param rssResourceId RSS 资源 ID
   */
  async deleteByResourceId(rssResourceId: string): Promise<number> {
    const db = getOrm();
    const res = await db.delete(rss_feed_items).where(eq(rss_feed_items.rssResourceId, rssResourceId)).run();
    return (res as any).changes ?? 0;
  },

  /**
   * 检查条目是否存在
   * @param rssResourceId RSS 资源 ID
   * @param itemId 条目 ID
   */
  async exists(rssResourceId: string, itemId: string): Promise<boolean> {
    const db = getOrm();
    const rows = await db
      .select({ id: rss_feed_items.id })
      .from(rss_feed_items)
      .where(and(eq(rss_feed_items.rssResourceId, rssResourceId), eq(rss_feed_items.itemId, itemId)))
      .limit(1);
    return !!rows.length;
  }
};
