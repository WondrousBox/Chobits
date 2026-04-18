import { ResourcesRepo, RssFeedItemsRepo } from '../../db/repositories';

/**
 * RSS 删除服务
 *
 * 只做：
 * - 订阅删除
 * - 关联条目清理
 * - 可选子资源删除
 *
 * 不做：
 * - UI 交互
 * - 权限校验
 */

const RSS_DELETE_CHILD_PAGE_SIZE = 200;

/**
 * 分页收集所有 RSS 子资源
 */
async function listAllRssChildResources(rssResourceId: string): Promise<any[]> {
    const children: any[] = [];
    let offset = 0;

    while (true) {
        const page = await ResourcesRepo.listChildren(rssResourceId, RSS_DELETE_CHILD_PAGE_SIZE, offset);
        if (!page.length) {
            break;
        }

        children.push(...page);
        if (page.length < RSS_DELETE_CHILD_PAGE_SIZE) {
            break;
        }

        offset += page.length;
    }

    return children;
}

export interface RssDeleteResult {
    id: string;
    deletedFeedCount: number;
    deletedDownloadedResourceCount: number;
    keptDownloadedResourceCount: number;
}

/**
 * 删除 RSS 订阅资源。
 *
 * @param id RSS 资源 ID
 * @param hardDelete 是否硬删除（彻底删除，默认 false 为软删除）
 * @param deleteDownloadedResources 是否同时删除已下载资源（默认 false）
 */
export async function deleteRssResource(
    id: string,
    hardDelete = false,
    deleteDownloadedResources = false
): Promise<RssDeleteResult> {
    const childResources = await listAllRssChildResources(id);
    const childResourceIds = childResources.map((resource) => resource.id);

    // 先删除关联的所有 feed 记录
    const deletedFeedCount = await RssFeedItemsRepo.deleteByResourceId(id);
    console.log(`[rss:delete] Deleted ${deletedFeedCount} related feed records`);

    if (hardDelete) {
        await ResourcesRepo.deleteByIds(deleteDownloadedResources ? [id, ...childResourceIds] : [id]);
        return {
            id,
            deletedFeedCount,
            deletedDownloadedResourceCount: deleteDownloadedResources ? childResourceIds.length : 0,
            keptDownloadedResourceCount: deleteDownloadedResources ? 0 : childResourceIds.length
        };
    }

    if (deleteDownloadedResources) {
        await ResourcesRepo.softDelete([id, ...childResourceIds]);
        return {
            id,
            deletedFeedCount,
            deletedDownloadedResourceCount: childResourceIds.length,
            keptDownloadedResourceCount: 0
        };
    }

    // 解除子资源的父子关系后仅软删除订阅本身
    for (const childId of childResourceIds) {
        await ResourcesRepo.update(childId, { parentResourceId: null } as any);
    }

    await ResourcesRepo.update(id, { deletedAt: Date.now() } as any);

    return {
        id,
        deletedFeedCount,
        deletedDownloadedResourceCount: 0,
        keptDownloadedResourceCount: childResourceIds.length
    };
}
