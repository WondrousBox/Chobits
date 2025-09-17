import { RecycleBinRepo } from '../../db/repositories';

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
  const restored = await RecycleBinRepo.restoreEntitiesByRecycleIds(ids);
  return { restored };
}

export async function purgeTrashByRecycleIds(ids: string[]) {
  const deleted = await RecycleBinRepo.purgeEntitiesByRecycleIds(ids);
  return { deleted };
}

export async function emptyTrash(filter: TrashFilter = {}) {
  const repoFilter: any = {};
  if (filter.entityType) repoFilter.entityType = filter.entityType;
  if (filter.deletedBy) repoFilter.deletedBy = filter.deletedBy;
  if (filter.deletedAtGte) repoFilter.deletedAt = filter.deletedAtGte;
  if (filter.expireAtLte) repoFilter.expireAt = filter.expireAtLte;
  const deleted = await RecycleBinRepo.empty(repoFilter);
  return { deleted };
}
