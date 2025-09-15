import { getOrm } from '../../db';
import { recycle_bin } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { RecycleBinRepo, DocumentsRepo, ResourcesRepo } from '../../db/repositories';

export type TrashFilter = {
  entityType?: 'document' | 'resource';
  deletedBy?: string;
  deletedAtGte?: number;
  expireAtLte?: number;
};

export async function listTrash(filter: TrashFilter = {}, limit = 100, offset = 0) {
  // Reuse repo list but adapt filter keys
  const repoFilter: any = {};
  if (filter.entityType) repoFilter.entityType = filter.entityType;
  if (filter.deletedBy) repoFilter.deletedBy = filter.deletedBy;
  if (filter.deletedAtGte) repoFilter.deletedAt = filter.deletedAtGte;
  if (filter.expireAtLte) repoFilter.expireAt = filter.expireAtLte;
  return RecycleBinRepo.list(repoFilter, limit, offset);
}

export async function restoreTrashByRecycleIds(ids: string[]) {
  if (!ids?.length) return { restored: 0 };
  const db = getOrm();
  const items = await db.select().from(recycle_bin).where(inArray(recycle_bin.id, ids)) as any[];
  if (!items.length) return { restored: 0 };
  const docIds = items.filter(i => i.entityType === 'document').map(i => i.entityId);
  const resIds = items.filter(i => i.entityType === 'resource').map(i => i.entityId);
  let restored = 0;
  if (docIds.length) restored += await DocumentsRepo.restore(docIds);
  if (resIds.length) restored += await ResourcesRepo.restore(resIds);
  return { restored };
}

export async function purgeTrashByRecycleIds(ids: string[]) {
  if (!ids?.length) return { deleted: 0 };
  const db = getOrm();
  const items = await db.select().from(recycle_bin).where(inArray(recycle_bin.id, ids)) as any[];
  if (!items.length) return { deleted: 0 };
  const docIds = items.filter(i => i.entityType === 'document').map(i => i.entityId);
  const resIds = items.filter(i => i.entityType === 'resource').map(i => i.entityId);
  let deleted = 0;
  if (docIds.length) deleted += await DocumentsRepo.deleteByIds(docIds);
  if (resIds.length) deleted += await ResourcesRepo.deleteByIds(resIds);
  return { deleted };
}

export async function emptyTrash(filter: TrashFilter = {}) {
  const items = await listTrash(filter, 10000, 0);
  if (!items.length) return { deleted: 0 };
  const ids = items.map(i => i.id);
  return purgeTrashByRecycleIds(ids);
}
