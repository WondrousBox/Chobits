import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { and, desc, eq, gte, inArray, isNotNull, isNull, like, lte, max } from 'drizzle-orm';
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
  type NewWorkspace,
  recycle_bin,
  type RecycleBinRow,
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
    let q = db.select().from(resources).innerJoin(resource_tags, eq(resource_tags.resourceId, resources.id));
    const wheres: any[] = [eq(resource_tags.tag, tag)];
    if (opts.workspaceId) wheres.push(eq(resource_tags.workspaceId, opts.workspaceId));
    if (!opts.includeDeleted) wheres.push(isNull(resources.deletedAt));
    q = (q as any)
      .where(and(...wheres))
      .orderBy(desc(resources.updatedAt as any))
      .limit(limit)
      .offset(offset);
    const rows = (await q) as any[];
    return rows.map((r) => (r as any).resources ?? (r as any));
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

    // 1) 预取将要删除的资源行，收集文件/缩略图路径
    const toDeleteRows = await db.select().from(resources).where(inArray(resources.id, ids));
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
    for (const rid of ids) {
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

    // 3) 删除资源表与回收站索引（事务内）
    let changes = 0;
    (db as any).transaction((tx: any) => {
      const res = tx.delete(resources).where(inArray(resources.id, ids)).run?.();
      changes = (res as any)?.changes ?? 0;
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids)).run?.();
    });

    // 4) 尝试删除磁盘上的实际文件与缩略图（容错，不影响主流程）
    const tryUnlink = async (p?: string): Promise<void> => {
      if (!p) return;
      try {
        if (fscb.existsSync(p)) await fs.unlink(p);
      } catch {
        /* ignore */
      }
    };
    await Promise.all([...filePaths.map(tryUnlink), ...thumbPaths.map(tryUnlink)]);

    return changes;
  },
  /** 单条物理删除资源（便捷封装） */
  async deleteById(id: string): Promise<number> {
    return this.deleteByIds([id]);
  },
  /** 批量软删除资源：标记 deletedAt 并写入回收站索引 */
  async softDelete(ids: string[]): Promise<ResourceRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    const now = Date.now();
    let resultRows: any[] = [];
    (db as any).transaction((tx: any) => {
      tx.update(resources).set({ deletedAt: now }).where(inArray(resources.id, ids)).run?.();
      const rows = tx.select({ id: resources.id, title: resources.title, description: resources.description, contentText: resources.contentText }).from(resources).where(inArray(resources.id, ids));
      const items = rows.map((r: any) => ({
        id: `res:${r.id}`,
        entityType: 'resource',
        entityId: r.id,
        title: r.title ?? r.description ?? r.contentText?.slice(0, 80) ?? r.id,
        summary: r.description ?? r.contentText?.slice(0, 160) ?? null,
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
      resultRows = tx.select().from(resources).where(inArray(resources.id, ids));
    });
    return resultRows as any;
  },
  /** 批量恢复资源：清空 deletedAt 并删除回收站索引 */
  async restore(ids: string[]): Promise<ResourceRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    let rows: any[] = [];
    (db as any).transaction((tx: any) => {
      tx.update(resources).set({ deletedAt: null, updatedAt: Date.now() }).where(inArray(resources.id, ids)).run?.();
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids)).run?.();
      rows = tx.select().from(resources).where(inArray(resources.id, ids));
    });
    return rows as any;
  },
  /** 基础列表与计数（含软删筛选） */
  async list(filter: Partial<ResourceRow> = {}, limit = 100, offset = 0): Promise<ResourceRow[]> {
    const db = getOrm();
    let query = db.select().from(resources);
    const wheres: any[] = [];
    if ((filter as any).type) wheres.push(eq(resources.type, (filter as any).type));
    if ((filter as any).status) wheres.push(eq(resources.status, (filter as any).status));
    if ((filter as any).visibility) wheres.push(eq(resources.visibility, (filter as any).visibility));
    if ((filter as any).tags) wheres.push(like(resources.tags, `%${(filter as any).tags}%`));
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
    return query.limit(limit).offset(offset);
  },
  async count(filter: Partial<ResourceRow> = {}): Promise<number> {
    const db = getOrm();
    let query = db.select({ count: resources.id }).from(resources);
    const wheres: any[] = [];
    if ((filter as any).type) wheres.push(eq(resources.type, (filter as any).type));
    if ((filter as any).status) wheres.push(eq(resources.status, (filter as any).status));
    if ((filter as any).visibility) wheres.push(eq(resources.visibility, (filter as any).visibility));
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
      return query.limit(limit).offset(offset);
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
    return query.limit(limit).offset(offset);
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
  async move(id: string, newParentId: string | null): Promise<FolderRow | undefined> {
    const db = getOrm();
    await db
      .update(folders)
      .set({ parentId: newParentId, updatedAt: Date.now() } as any)
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

    // 更新会话计数与时间，并在首条用户消息时自动生成标题
    const conv = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    const prevCount = conv[0]?.messagesCount ?? 0;
    const countVal = prevCount + 1;
    const patch: any = { messagesCount: countVal, lastMessageAt: now, updatedAt: now };
    if ((!conv[0]?.title || conv[0]?.title === null) && message.role === 'user' && nextSeq === 1) {
      const raw = (message.content || '').trim();
      const short = raw.length > 40 ? raw.slice(0, 40) + '…' : raw;
      patch.title = short || '新对话';
    }
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
  async findByEvent(resourceType: string, eventType: string, workspaceId?: string): Promise<AutomationRuleRow[]> {
    const db = getOrm();
    // Query all enabled rules with triggerType 'resource_event'
    // Then filter in memory or use JSON operators if available (but standard sqlite json support varies in drizzle)
    // For simplicity and compatibility, we fetch candidates and filter.

    const candidates = await db
      .select()
      .from(automation_rules)
      .where(and(eq(automation_rules.enabled, 1), eq(automation_rules.triggerType, 'resource_event')))
      .all();

    return candidates.filter((rule) => {
      // 1. Check Scope
      if (rule.scope === 'workspace') {
        if (rule.workspaceId && rule.workspaceId !== workspaceId) return false;
      }

      // 2. Check Trigger Config
      const config = rule.triggerConfig as any;
      if (!config) return false;

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
  }
};
