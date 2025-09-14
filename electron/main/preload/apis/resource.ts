import { getOrm } from '../../db';
import { resources } from '../../db/schema';
import { eq, like, and, isNull, isNotNull } from 'drizzle-orm';

/**
 * 资源表操作 API
 * - 支持新增、删除、更新、单条/批量查询、计数、存在性判断、筛选/分页等
 */
export async function addResource(resource: any) {
  const db = getOrm();
  await db.insert(resources).values(resource);
}

/**
 * 更新资源（部分字段）
 * @param id 资源ID
 * @param patch 需更新的字段对象
 */
export async function updateResource(id: string, patch: Partial<any>) {
  const db = getOrm();
  await db.update(resources).set({ ...patch, updatedAt: Date.now() }).where(eq(resources.id, id));
}

/**
 * 查询资源列表（可选筛选条件，支持分页）
 * @param filter 筛选条件对象（如 type, status, visibility, tags, createdAt, deletedAt 等）
 * @param limit 每页数量
 * @param offset 偏移量
 */
export async function listResources(filter: Partial<any> = {}, limit = 100, offset = 0) {
  const db = getOrm();
  let query = db.select().from(resources);
  const wheres: any[] = [];
  if (filter.type) wheres.push(eq(resources.type, filter.type));
  if (filter.status) wheres.push(eq(resources.status, filter.status));
  if (filter.visibility) wheres.push(eq(resources.visibility, filter.visibility));
  if (filter.tags) wheres.push(like(resources.tags, `%${filter.tags}%`));
  if (filter.deletedAt === 0) wheres.push(isNull(resources.deletedAt));
  if (filter.deletedAt === 1) wheres.push(isNotNull(resources.deletedAt));
  if (wheres.length) query = query.where(and(...wheres));
  return query.limit(limit).offset(offset);
}

/**
 * 获取单条资源
 * @param id 资源ID
 */
export async function getResource(id: string) {
  const db = getOrm();
  return await db.select().from(resources).where(eq(resources.id, id)).get();
}

/**
 * 删除资源
 * @param id 资源ID
 */
export async function deleteResource(id: string) {
  const db = getOrm();
  await db.delete(resources).where(eq(resources.id, id));
}

/**
 * 统计资源数量（可选筛选条件）
 * @param filter 筛选条件对象
 */
export async function countResources(filter: Partial<any> = {}) {
  const db = getOrm();
  let query = db.select({ count: resources.id }).from(resources);
  const wheres: any[] = [];
  if (filter.type) wheres.push(eq(resources.type, filter.type));
  if (filter.status) wheres.push(eq(resources.status, filter.status));
  if (filter.visibility) wheres.push(eq(resources.visibility, filter.visibility));
  if (filter.deletedAt === 0) wheres.push(isNull(resources.deletedAt));
  if (filter.deletedAt === 1) wheres.push(isNotNull(resources.deletedAt));
  if (wheres.length) query = query.where(and(...wheres));
  const rows = await query;
  return rows[0]?.count ?? 0;
}

/**
 * 判断资源是否存在（根据主键）
 * @param id 资源ID
 */
export async function existsResource(id: string) {
  const db = getOrm();
  const rows = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
  return !!rows.length;
}
