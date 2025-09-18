import { ResourcesRepo } from '../../db/repositories';

/**
 * 资源表操作 API
 * - 支持新增、删除、更新、单条/批量查询、计数、存在性判断、筛选/分页等
 */
export async function addResource(resource: any) {
  return ResourcesRepo.upsert(resource);
}

/**
 * 更新资源（部分字段）
 * @param id 资源ID
 * @param patch 需更新的字段对象
 */
export async function updateResource(id: string, patch: Partial<any>) {
  return ResourcesRepo.update(id, patch);
}

/**
 * 查询资源列表（可选筛选条件，支持分页）
 * @param filter 筛选条件对象（如 type, status, visibility, tags, createdAt, deletedAt 等）
 * @param limit 每页数量
 * @param offset 偏移量
 */
export async function listResources(filter: Partial<any> = {}, limit = 100, offset = 0) {
  return ResourcesRepo.list(filter as any, limit, offset);
}

/**
 * 获取单条资源
 * @param id 资源ID
 */
export async function getResource(id: string) {
  return ResourcesRepo.getById(id);
}

/**
 * 删除资源
 * @param id 资源ID
 */
export async function deleteResource(id: string) {
  return ResourcesRepo.deleteById(id);
}

/**
 * 统计资源数量（可选筛选条件）
 * @param filter 筛选条件对象
 */
export async function countResources(filter: Partial<any> = {}) {
  return ResourcesRepo.count(filter as any);
}

/**
 * 判断资源是否存在（根据主键）
 * @param id 资源ID
 */
export async function existsResource(id: string) {
  return ResourcesRepo.exists(id);
}
