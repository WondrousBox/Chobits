import { getOrm } from '.';
import { documents, type NewDocument, type DocumentRow, recycle_bin, type NewRecycleBin, type RecycleBinRow, workspaces, type WorkspaceRow, type NewWorkspace, folders, type FolderRow, type NewFolder, conversations, type ConversationRow, type NewConversation, chat_messages, type ChatMessageRow, type NewChatMessage } from './schema';
import { eq, inArray, and, or, like, gte, lte, isNull, isNotNull, desc, count, max } from 'drizzle-orm';
import { rebuildVectors, deleteVectors } from '.';
import { resources, type ResourceRow, type NewResource } from './schema';

function omitId<T extends { id?: any }>(obj: T): Omit<T, 'id'> {
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
    const res = await db.delete(documents).where(inArray(documents.id, ids));
    // 清理回收站索引（若有残留）
    await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
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
      updatedRows = tx
        .update(documents)
        .set({ deletedAt: now })
        .where(inArray(documents.id, ids))
        .returning()
        .all();
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
        expireAt: null,
      }));
      if (items.length) {
        tx.insert(recycle_bin).values(items as any).onConflictDoUpdate({
          target: recycle_bin.id,
          set: { deletedAt: now },
        });
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
      rows = tx
        .update(documents)
        .set({ deletedAt: null, updatedAt: Date.now() })
        .where(inArray(documents.id, ids))
        .returning()
        .all();
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
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
  },
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
    await db.insert(recycle_bin).values(item).onConflictDoUpdate({
      target: recycle_bin.id,
      set: { ...item },
    });
  },
  /**
   * 批量新增回收站索引
   */
  async bulkAdd(items: NewRecycleBin[]) {
    const db = getOrm();
    if (!items.length) return;
    await db.insert(recycle_bin).values(items).onConflictDoUpdate({
      target: recycle_bin.id,
      set: { ...items[0] },
    });
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
    const res = await db.delete(recycle_bin).where(inArray(recycle_bin.id, ids));
    return (res as any).changes ?? 0;
  },
  /**
   * 恢复回收站索引（恢复原表后调用，物理删除索引）
   */
  async restore(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(recycle_bin).where(inArray(recycle_bin.id, ids));
    return (res as any).changes ?? 0;
  },
  /** 根据回收站ID恢复实体（文档/资源），并同步清理回收站索引 */
  async restoreEntitiesByRecycleIds(ids: string[]): Promise<number> {
    if (!ids?.length) return 0;
    const db = getOrm();
    const items = (await db.select().from(recycle_bin).where(inArray(recycle_bin.id, ids))) as any[];
    if (!items.length) return 0;
    const docIds = items.filter(i => i.entityType === 'document').map(i => i.entityId);
    const resIds = items.filter(i => i.entityType === 'resource').map(i => i.entityId);
    const convIds = items.filter(i => i.entityType === 'conversation').map(i => i.entityId);
    let restored = 0;
    if (docIds.length) restored += (await DocumentsRepo.restore(docIds)).length;
    if (resIds.length) restored += (await ResourcesRepo.restore(resIds)).length;
    if (convIds.length) {
      for (const id of convIds) {
        const row = await ChatRepo.restoreConversation(id);
        if (row) restored += 1;
      }
    }
    return restored;
  },
  /** 根据回收站ID彻底删除实体（文档/资源），并同步清理回收站索引 */
  async purgeEntitiesByRecycleIds(ids: string[]): Promise<number> {
    if (!ids?.length) return 0;
    const db = getOrm();
    const items = (await db.select().from(recycle_bin).where(inArray(recycle_bin.id, ids))) as any[];
    if (!items.length) return 0;
    const docIds = items.filter(i => i.entityType === 'document').map(i => i.entityId);
    const resIds = items.filter(i => i.entityType === 'resource').map(i => i.entityId);
    const convIds = items.filter(i => i.entityType === 'conversation').map(i => i.entityId);
    let deleted = 0;
    if (docIds.length) deleted += await DocumentsRepo.deleteByIds(docIds);
    if (resIds.length) deleted += await ResourcesRepo.deleteByIds(resIds);
    if (convIds.length) deleted += await ChatRepo.deleteConversations(convIds);
    return deleted;
  },
  /** 清空回收站（按可选筛选），并对实体执行彻底删除 */
  async empty(filter: Partial<RecycleBinRow> = {}): Promise<number> {
    const items = await this.list(filter, 10000, 0);
    if (!items.length) return 0;
    const ids = items.map(i => i.id);
    return this.purgeEntitiesByRecycleIds(ids);
  },
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
    return rows[0];
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
    await db.update(resources).set({ ...patch, updatedAt: Date.now() } as any).where(eq(resources.id, id));
    const rows = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
    return rows[0];
  },
  /** 批量物理删除资源，并清理回收站索引 */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(resources).where(inArray(resources.id, ids));
    await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
    return (res as any).changes ?? 0;
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
      tx.update(resources).set({ deletedAt: now }).where(inArray(resources.id, ids));
      const rows = tx
        .select({ id: resources.id, title: resources.title, description: resources.description, contentText: resources.contentText })
        .from(resources)
        .where(inArray(resources.id, ids));
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
        expireAt: null,
      }));
      if (items.length) {
        tx.insert(recycle_bin).values(items as any).onConflictDoUpdate({
          target: recycle_bin.id,
          set: { deletedAt: now },
        });
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
      tx.update(resources).set({ deletedAt: null, updatedAt: Date.now() }).where(inArray(resources.id, ids));
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
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
    if ((filter as any).deletedAt === 0) wheres.push(isNull(resources.deletedAt));
    if ((filter as any).deletedAt === 1) wheres.push(isNotNull(resources.deletedAt));
    if (wheres.length) query = query.where(and(...wheres));
    const rows = await query;
    return rows[0]?.count ?? 0;
  },
};

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
    await db.update(folders).set({ name: newName, updatedAt: Date.now() } as any).where(eq(folders.id, id));
    const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return rows[0];
  },
  /** 移动到新父目录（支持置空为根） */
  async move(id: string, newParentId: string | null): Promise<FolderRow | undefined> {
    const db = getOrm();
    await db.update(folders).set({ parentId: newParentId, updatedAt: Date.now() } as any).where(eq(folders.id, id));
    const rows = await db.select().from(folders).where(eq(folders.id, id)).limit(1);
    return rows[0];
  },
  /** 软删除 */
  async softDelete(ids: string[]): Promise<FolderRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    await db.update(folders).set({ deletedAt: Date.now() } as any).where(inArray(folders.id, ids));
    return await db.select().from(folders).where(inArray(folders.id, ids));
  },
  /** 恢复 */
  async restore(ids: string[]): Promise<FolderRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    await db.update(folders).set({ deletedAt: null, updatedAt: Date.now() } as any).where(inArray(folders.id, ids));
    return await db.select().from(folders).where(inArray(folders.id, ids));
  },
  /** 物理删除（谨慎） */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(folders).where(inArray(folders.id, ids));
    return (res as any).changes ?? 0;
  },
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
    const rows = await db.select().from(workspaces).where(and(eq(workspaces.isDefault as any, 1), isNull(workspaces.deletedAt)) as any).limit(1);
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
      tx.update(workspaces).set({ isDefault: 0 as any, updatedAt: now }).where(eq(workspaces.isDefault as any, 1));
      // 2) 设定新默认
      tx.update(workspaces).set({ isDefault: 1 as any, updatedAt: now }).where(eq(workspaces.id, id));
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
    await db.update(workspaces).set({ ...patch, updatedAt: Date.now() } as any).where(eq(workspaces.id, id));
    const rows = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
    return rows[0];
  },
  /** 软删 */
  async softDelete(ids: string[]): Promise<WorkspaceRow[]> {
    if (!ids.length) return [];
    const db = getOrm();
    await db.update(workspaces).set({ deletedAt: Date.now() }).where(inArray(workspaces.id, ids));
    return await db.select().from(workspaces).where(inArray(workspaces.id, ids));
  },
  /** 物理删除 */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(workspaces).where(inArray(workspaces.id, ids));
    return (res as any).changes ?? 0;
  },
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
      updatedAt: now,
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
    const seqRow = (await db
      .select({ m: max(chat_messages.seq).as('max') })
      .from(chat_messages)
      .where(eq(chat_messages.conversationId, conversationId)))[0] as any;
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
        updatedAt: now,
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
    await db.update(conversations)
      .set(patch)
      .where(eq(conversations.id, conversationId));
    return rows[0];
  },

  async listConversations(filter: { includeDeleted?: boolean } = {}, limit = 100, offset = 0): Promise<ConversationRow[]> {
    const db = getOrm();
    let q = db.select().from(conversations);
    const wheres: any[] = [];
    if (!filter.includeDeleted) wheres.push(isNull(conversations.deletedAt));
    if (wheres.length) q = q.where(and(...wheres));
    return q.orderBy(desc(conversations.pinned as any), desc(conversations.lastMessageAt as any), desc(conversations.updatedAt as any)).limit(limit).offset(offset);
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
    await db.update(conversations).set({ title, updatedAt: now } as any).where(eq(conversations.id, id));
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  },

  async softDeleteConversation(id: string): Promise<ConversationRow | undefined> {
    const db = getOrm();
    const now = Date.now();
    await db.update(conversations).set({ deletedAt: now, updatedAt: now } as any).where(eq(conversations.id, id));
    const rows = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
    return rows[0];
  },

  /** 恢复会话（清空 deletedAt） */
  async restoreConversation(id: string): Promise<ConversationRow | undefined> {
    const db = getOrm();
    const now = Date.now();
    await db.update(conversations).set({ deletedAt: null, updatedAt: now } as any).where(eq(conversations.id, id));
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
      const res = tx.delete(conversations).where(inArray(conversations.id, ids));
      deleted = ((res as any)?.changes ?? 0);
      tx.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
    });
    return deleted;
  },
};

