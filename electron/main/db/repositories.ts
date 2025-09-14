import { getOrm } from '.';
import { documents, type NewDocument, type DocumentRow, recycle_bin, type NewRecycleBin, type RecycleBinRow } from './schema';
import { eq, inArray, and, or, like, gte, lte, isNull, isNotNull } from 'drizzle-orm';
import { rebuildVectors, deleteVectors } from '.';
import { resources, type ResourceRow, type NewResource } from './schema';

/**
 * 文档表操作仓库
 * - 支持 upsert、批量 upsert、单条/批量删除、软删除、恢复、更新、分页、筛选、计数、存在性判断等
 * - 所有字段均支持写入和筛选
 * - 推荐所有写操作用事务包裹（如批量）
 */
export const DocumentsRepo = {
  /**
   * 新增或更新单条文档（主键冲突自动更新）
   * @param doc 文档对象（所有字段均可填）
   */
  async upsert(doc: NewDocument) {
    const db = getOrm();
    await db.insert(documents).values(doc).onConflictDoUpdate({
      target: documents.id,
      set: { ...doc },
    });
  },
  /**
   * 批量新增或更新文档（主键冲突自动更新）
   * @param docs 文档对象数组
   */
  async bulkUpsert(docs: NewDocument[]) {
    const db = getOrm();
    if (!docs.length) return;
    await db.insert(documents).values(docs).onConflictDoUpdate({
      target: documents.id,
      set: { ...docs[0] }, // 只取第一个字段结构，实际 excluded 由 drizzle 处理
    });
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
  async softDelete(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const now = Date.now();
    const tx = (db as any).transaction(async () => {
      const res = await db.update(documents).set({ deletedAt: now }).where(inArray(documents.id, ids));
      // 同步回收站索引
      const rows = await db.select({ id: documents.id, title: documents.title, content: documents.content }).from(documents).where(inArray(documents.id, ids));
      const items = rows.map((r: any) => ({
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
        await db.insert(recycle_bin).values(items as any).onConflictDoUpdate({
          target: recycle_bin.id,
          set: { deletedAt: now },
        });
      }
      // 删除向量表记录（软删也移除检索）
      deleteVectors(ids);
      return (res as any).changes ?? 0;
    });
    return await tx();
  },
  /**
   * 恢复软删除（清空 deletedAt）
   * @param ids 文档ID数组
   * @returns 实际恢复数量
   */
  async restore(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const tx = (db as any).transaction(async () => {
      const res = await db.update(documents).set({ deletedAt: null, updatedAt: Date.now() }).where(inArray(documents.id, ids));
      // 移除回收站索引
      await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
      // 重建向量索引（使用已存储的 embedding )
      // 这里需要调用 rebuildVectors，要求调用方提供 dim；简单场景可从任一 embedding 取长度
      // 建议在上层传入 dim，这里暂不推断
      return (res as any).changes ?? 0;
    });
    return await tx();
  },

  /**
   * 恢复并重建向量索引（需要调用方提供 dim）
   */
  async restoreWithIndex(ids: string[], dim: number): Promise<number> {
    if (!ids.length) return 0;
    const updated = await this.restore(ids);
    if (updated > 0) rebuildVectors(ids, dim);
    return updated;
  },

  /**
   * 软删除并写入回收站（带索引）
   */
  async softDeleteWithIndex(ids: string[]): Promise<number> {
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
 * 回收站操作仓库
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
};

/**
 * 资源表操作仓库
 * - 支持 upsert、批量 upsert、单条/批量删除、软删除、恢复、更新、分页、筛选、计数、存在性判断等
 * - 所有字段均支持写入和筛选
 * - 推荐所有写操作用事务包裹（如批量）
 */
export const ResourcesRepo = {
  /** 批量物理删除资源，并清理回收站索引 */
  async deleteByIds(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const res = await db.delete(resources).where(inArray(resources.id, ids));
    await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
    return (res as any).changes ?? 0;
  },
  /** 批量软删除资源：标记 deletedAt 并写入回收站索引 */
  async softDelete(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const now = Date.now();
    const tx = (db as any).transaction(async () => {
      const res = await db.update(resources).set({ deletedAt: now }).where(inArray(resources.id, ids));
      const rows = await db
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
        await db.insert(recycle_bin).values(items as any).onConflictDoUpdate({
          target: recycle_bin.id,
          set: { deletedAt: now },
        });
      }
      return (res as any).changes ?? 0;
    });
    return await tx();
  },
  /** 批量恢复资源：清空 deletedAt 并删除回收站索引 */
  async restore(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const db = getOrm();
    const tx = (db as any).transaction(async () => {
      const res = await db.update(resources).set({ deletedAt: null, updatedAt: Date.now() }).where(inArray(resources.id, ids));
      await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, ids));
      return (res as any).changes ?? 0;
    });
    return await tx();
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
