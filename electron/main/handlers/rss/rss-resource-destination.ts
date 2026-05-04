import { FoldersRepo, WorkspacesRepo } from '../../db/repositories';
import { ensureDailyFolder } from '../resource';

export interface RssResourceDestination {
  workspaceId?: string;
  folderId?: string;
}

function normalizeId(value?: string | null): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function resolveRssResourceDestination(options: { workspaceId?: string | null; folderId?: string | null } = {}): Promise<RssResourceDestination> {
  let folderId = normalizeId(options.folderId);
  let workspaceId = normalizeId(options.workspaceId);

  if (folderId) {
    const folder = await FoldersRepo.getById(folderId);
    workspaceId = folder?.workspaceId || workspaceId;
  }

  const workspace = (workspaceId ? await WorkspacesRepo.getById(workspaceId) : undefined) || (await WorkspacesRepo.getDefault());
  if (!workspace?.id) {
    return { workspaceId, folderId };
  }

  workspaceId = workspace.id;

  if (!folderId && workspace.rootPath) {
    folderId = await ensureDailyFolder(workspace.id, workspace.rootPath);
  }

  return { workspaceId, folderId };
}
