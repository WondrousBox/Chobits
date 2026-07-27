import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { eq, inArray } from 'drizzle-orm';

import { getOrm } from '../../db';
import { automation_rules, chat_messages, conversations, documents, folders, resource_tags, resources, rss_feed_items, workflowRuns, workflows, type WorkspaceRow, workspaces } from '../../db/schema';

/**
 * 工作空间导出数据结构
 */
export interface WorkspaceExportData {
  version: string; // 导出格式版本
  exportedAt: number; // 导出时间戳
  originalWorkspaceId: string; // 原始工作空间ID（用于识别是否是同一工作空间的备份）
  workspace: WorkspaceRow;
  folders: any[];
  resources: any[];
  documents: any[];
  resourceTags: any[];
  conversations: any[];
  chatMessages: any[];
  workflows: any[];
  workflowRuns: any[];
  automationRules: any[];
  rssFeedItems: any[];
}

/**
 * 导出工作空间到目录
 * @param workspaceId 工作空间ID
 * @param destPath 目标目录路径
 * @returns 导出是否成功
 */
export async function exportWorkspace(workspaceId: string, destPath: string): Promise<{ success: boolean; error?: string }> {
  const db = getOrm();

  try {
    // 1. 获取工作空间信息
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) {
      return { success: false, error: '工作空间不存在' };
    }

    // 2. 查询所有相关数据
    const [folderRows, resourceRows, documentRows, resourceTagRows, conversationRows, workflowRows, workflowRunRows, automationRuleRows, rssFeedItemRows] = await Promise.all([
      db.select().from(folders).where(eq(folders.workspaceId, workspaceId)),
      db.select().from(resources).where(eq(resources.workspaceId, workspaceId)),
      db.select().from(documents).where(eq(documents.workspaceId, workspaceId)),
      db.select().from(resource_tags).where(eq(resource_tags.workspaceId, workspaceId)),
      db.select().from(conversations).where(eq(conversations.workspaceId, workspaceId)),
      db.select().from(workflows).where(eq(workflows.workspaceId, workspaceId)),
      db.select().from(workflowRuns).where(eq(workflowRuns.workspaceId, workspaceId)),
      db.select().from(automation_rules).where(eq(automation_rules.workspaceId, workspaceId)),
      db
        .select()
        .from(rss_feed_items)
        .where(inArray(rss_feed_items.rssResourceId, db.select({ id: resources.id }).from(resources).where(eq(resources.workspaceId, workspaceId))))
    ]);

    // 获取对话消息
    const conversationIds = conversationRows.map((c: any) => c.id);
    const chatMessageRows = conversationIds.length ? await db.select().from(chat_messages).where(inArray(chat_messages.conversationId, conversationIds)) : [];

    const { rootPath, ...rest } = workspace;

    const workspaceRoot = path.resolve(rootPath);
    const toRelativeIfInWorkspace = (targetPath?: string | null): string | null | undefined => {
      if (!targetPath || !path.isAbsolute(targetPath)) {
        return targetPath;
      }
      const resolvedTarget = path.resolve(targetPath);
      const relative = path.relative(workspaceRoot, resolvedTarget);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        return targetPath;
      }
      return relative;
    };

    const normalizedResourceRows = resourceRows.map((resource: any) => ({
      ...resource,
      filePath: toRelativeIfInWorkspace(resource.filePath),
      thumbnailPath: toRelativeIfInWorkspace(resource.thumbnailPath)
    }));

    // 3. 构建导出数据
    const exportData: WorkspaceExportData = {
      version: '1.0.0',
      exportedAt: Date.now(),
      originalWorkspaceId: workspace.id, // 保存原始ID用于识别
      workspace: rest,
      folders: folderRows,
      resources: normalizedResourceRows,
      documents: documentRows,
      resourceTags: resourceTagRows,
      conversations: conversationRows,
      chatMessages: chatMessageRows,
      workflows: workflowRows,
      workflowRuns: workflowRunRows,
      automationRules: automationRuleRows,
      rssFeedItems: rssFeedItemRows
    };

    // 4. 创建导出目录
    // 如果目标路径已存在并且不是空的文件夹，为避免污染用户数据，创建一个 export 子文件夹
    let finalDestPath = destPath;
    if (fs.existsSync(destPath)) {
      const stat = fs.statSync(destPath);
      if (!stat.isDirectory()) {
        // 如果路径存在但不是目录，创建一个带后缀的导出目录
        const candidate = `${destPath}-export-${Date.now()}`;
        finalDestPath = candidate;
      } else {
        // 是目录，检查是否为空（忽略隐藏文件与常见系统文件）
        const entries = await fsp.readdir(destPath);
        const ignoredNames = new Set(['.DS_Store', 'Thumbs.db']);
        const meaningful = entries.filter((name) => !name.startsWith('.') && !ignoredNames.has(name));

        if (meaningful.length > 0) {
          // 目录非空，使用 export 子目录，若已存在则加上时间戳以避免冲突
          let candidate = path.join(destPath, 'export');
          if (fs.existsSync(candidate)) {
            candidate = path.join(destPath, `export-${Date.now()}`);
          }
          finalDestPath = candidate;
        }
      }
    }

    await fsp.mkdir(finalDestPath, { recursive: true });

    // 5. 写入数据库数据
    const dataJsonPath = path.join(finalDestPath, 'workspace-data.json');
    await fsp.writeFile(dataJsonPath, JSON.stringify(exportData, null, 2), 'utf-8');

    // 6. 复制工作空间文件夹
    if (fs.existsSync(rootPath)) {
      await copyDirectory(rootPath, finalDestPath);
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || '导出失败' };
  }
}

/**
 * 导入工作空间
 * @param sourcePath 导出的工作空间目录路径
 * @returns 导入结果
 */
export async function importWorkspace(sourcePath: string): Promise<{ success: boolean; workspaceId?: string; error?: string }> {
  const db = getOrm();

  try {
    // 1. 读取数据
    const dataJsonPath = path.join(sourcePath, 'workspace-data.json');
    if (!fs.existsSync(dataJsonPath)) {
      return { success: false, error: '无效的工作空间导出文件：找不到 workspace-data.json' };
    }

    const dataContent = await fsp.readFile(dataJsonPath, 'utf-8');
    const exportData: WorkspaceExportData = JSON.parse(dataContent);

    // 使用导出目录作为工作空间根路径
    exportData.workspace.rootPath = sourcePath;

    // 2. 检查目标路径是否已被使用
    const existingByPath = await db.select().from(workspaces).where(eq(workspaces.rootPath, sourcePath)).limit(1);
    if (existingByPath.length > 0) {
      return {
        success: false,
        error: `目标路径已被工作空间 "${existingByPath[0].name}" 使用，请选择其他目录`
      };
    }

    // 3. 创建ID映射表（用于处理外键关联）
    const idMappings = {
      workspaceId: '',
      folders: new Map<string, string>(),
      resources: new Map<string, string>(),
      documents: new Map<string, string>(),
      conversations: new Map<string, string>(),
      workflows: new Map<string, string>()
    };

    // 4. 导入工作空间（在事务中执行，注意 better-sqlite 不支持 Promise）
    let transactionResult: { success: boolean; workspaceId?: string } = { success: false };
    const newWorkspaceId = randomUUID();
    idMappings.workspaceId = newWorkspaceId;

    db.transaction((tx: any) => {
      // 创建工作空间
      tx.insert(workspaces)
        .values({
          id: newWorkspaceId,
          name: exportData.workspace.name,
          rootPath: exportData.workspace.rootPath,
          description: exportData.workspace.description,
          isDefault: 0, // 导入的工作空间默认不设为默认
          status: 'active',
          metadata: exportData.workspace.metadata,
          createdAt: exportData.workspace.createdAt,
          updatedAt: Date.now()
        })
        .run?.();

      // 4. 导入文件夹（需要处理父子关系）
      for (const folder of exportData.folders) {
        const newId = randomUUID();
        idMappings.folders.set(folder.id, newId);
      }

      for (const folder of exportData.folders) {
        const newId = idMappings.folders.get(folder.id)!;
        const newParentId = folder.parentId ? idMappings.folders.get(folder.parentId) : null;
        tx.insert(folders)
          .values({
            id: newId,
            name: folder.name,
            description: folder.description,
            parentId: newParentId,
            workspaceId: newWorkspaceId,
            metadata: folder.metadata,
            rank: folder.rank,
            createdAt: folder.createdAt,
            updatedAt: Date.now()
          })
          .run?.();
      }

      const resolveResourcePath = (resourcePath?: string | null): string | null | undefined => {
        if (!resourcePath) {
          return resourcePath;
        }

        if (path.isAbsolute(resourcePath)) {
          return resourcePath;
        }

        const normalized = path.normalize(resourcePath);
        const parts = normalized.split(path.sep);
        if (parts.length >= 3 && parts[0] === 'resources' && parts[1] === 'folders') {
          const oldFolderId = parts[2];
          const newFolderId = idMappings.folders.get(oldFolderId);
          if (newFolderId) {
            parts[2] = newFolderId;
          }
        }

        return path.resolve(sourcePath, parts.join(path.sep));
      };

      // 5. 导入资源
      for (const resource of exportData.resources) {
        const newId = randomUUID();
        idMappings.resources.set(resource.id, newId);

        const newFolderId = resource.folderId ? idMappings.folders.get(resource.folderId) : null;
        const newParentResourceId = resource.parentResourceId ? idMappings.resources.get(resource.parentResourceId) : null;

        tx.insert(resources)
          .values({
            ...resource,
            id: newId,
            workspaceId: newWorkspaceId,
            folderId: newFolderId,
            parentResourceId: newParentResourceId,
            filePath: resolveResourcePath(resource.filePath),
            thumbnailPath: resolveResourcePath(resource.thumbnailPath),
            createdAt: resource.createdAt,
            updatedAt: Date.now()
          })
          .run?.();
      }
      // 6. 导入文档
      for (const document of exportData.documents) {
        const newId = randomUUID();
        idMappings.documents.set(document.id, newId);

        const newSourceId = document.sourceId ? idMappings.resources.get(document.sourceId) : null;
        const newParentId = document.parentId ? idMappings.documents.get(document.parentId) : null;

        tx.insert(documents)
          .values({
            ...document,
            id: newId,
            workspaceId: newWorkspaceId,
            sourceId: newSourceId,
            parentId: newParentId,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          .run?.();
      }

      // 7. 导入资源标签
      for (const tag of exportData.resourceTags) {
        const newResourceId = idMappings.resources.get(tag.resourceId);
        if (newResourceId) {
          tx.insert(resource_tags)
            .values({
              id: randomUUID(),
              resourceId: newResourceId,
              workspaceId: newWorkspaceId,
              tag: tag.tag,
              createdAt: Date.now()
            })
            .run?.();
        }
      }

      // 8. 导入对话
      for (const conversation of exportData.conversations) {
        const newId = randomUUID();
        idMappings.conversations.set(conversation.id, newId);

        tx.insert(conversations)
          .values({
            ...conversation,
            id: newId,
            workspaceId: newWorkspaceId,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          .run?.();
      }

      // 9. 导入对话消息
      for (const message of exportData.chatMessages) {
        const newConversationId = idMappings.conversations.get(message.conversationId);
        if (newConversationId) {
          tx.insert(chat_messages)
            .values({
              ...message,
              id: randomUUID(),
              conversationId: newConversationId,
              createdAt: Date.now(),
              updatedAt: Date.now()
            })
            .run?.();
        }
      }

      // 10. 导入工作流
      for (const workflow of exportData.workflows) {
        const newId = randomUUID();
        idMappings.workflows.set(workflow.id, newId);

        tx.insert(workflows)
          .values({
            ...workflow,
            id: newId,
            workspaceId: newWorkspaceId,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          .run?.();
      }

      // 11. 导入工作流运行记录
      for (const run of exportData.workflowRuns) {
        const newWorkflowId = idMappings.workflows.get(run.workflowId) || run.workflowId;
        tx.insert(workflowRuns)
          .values({
            ...run,
            id: randomUUID(),
            workflowId: newWorkflowId,
            workspaceId: newWorkspaceId
          })
          .run?.();
      }

      // 12. 导入自动化规则
      for (const rule of exportData.automationRules) {
        tx.insert(automation_rules)
          .values({
            ...rule,
            id: randomUUID(),
            workspaceId: newWorkspaceId,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          .run?.();
      }

      // 13. 导入RSS订阅条目
      for (const item of exportData.rssFeedItems) {
        const newRssResourceId = idMappings.resources.get(item.rssResourceId);
        const newLocalResourceId = item.localResourceId ? idMappings.resources.get(item.localResourceId) : null;

        if (newRssResourceId) {
          tx.insert(rss_feed_items)
            .values({
              ...item,
              id: randomUUID(),
              rssResourceId: newRssResourceId,
              localResourceId: newLocalResourceId,
              createdAt: Date.now()
            })
            .run?.();
        }
      }

      transactionResult = { success: true, workspaceId: newWorkspaceId };
    });

    // 文件夹都放在导入路径 sourcePath 的 resources/folders 目录下，都是以 ID 命名的，
    // 因此在插入新的文件夹 ID 的时候，要把旧的文件夹 ID 名称改成新的 ID 名称。
    // 如果目标目录已存在则把旧目录内容合并到目标目录并删除旧目录；如果旧目录不存在则忽略。
    // 文件夹重命名与合并（不在事务内执行）
    for (const folder of exportData.folders) {
      const newId = idMappings.folders.get(folder.id)!;
      try {
        const foldersDir = path.join(sourcePath, 'resources', 'folders');
        const oldFolderPath = path.join(foldersDir, folder.id);
        const newFolderPath = path.join(foldersDir, newId);

        if (fs.existsSync(oldFolderPath)) {
          if (!fs.existsSync(newFolderPath)) {
            await fsp.mkdir(path.dirname(newFolderPath), { recursive: true });
            await fsp.rename(oldFolderPath, newFolderPath);
          } else {
            await copyDirectory(oldFolderPath, newFolderPath);
            await fsp.rm(oldFolderPath, { recursive: true, force: true });
          }
        }
      } catch (err: any) {
        console.warn(`Failed to rename/merge folder directory for ${folder.id} -> ${newId}:`, err?.message || err);
      }
    }

    if (transactionResult.success) {
      try {
        await fsp.rm(dataJsonPath, { force: true });
      } catch {
        // ignore cleanup errors
      }
    }

    return transactionResult;
  } catch (error: any) {
    return { success: false, error: error?.message || '导入失败' };
  }
}

/**
 * 递归复制目录
 */
async function copyDirectory(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });

  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isFile()) {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

/**
 * 完整删除工作空间，包括所有关联数据和文件
 * @param workspaceId 工作空间ID
 * @returns 删除结果
 */
export async function deleteWorkspaceCompletely(workspaceId: string, options?: { keepFolder?: boolean }): Promise<{ success: boolean; error?: string }> {
  const db = getOrm();

  try {
    // 1. 获取工作空间信息
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    if (!workspace) {
      return { success: false, error: '工作空间不存在' };
    }

    const rootPath = workspace.rootPath;

    try {
      // 2. 在事务中删除所有数据库记录（同步执行）
      db.transaction((tx: any) => {
        const conversationRows = tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.workspaceId, workspaceId)).all?.() ?? [];
        const conversationIds = conversationRows.map((c: any) => c.id);

        const resourceRows = tx.select({ id: resources.id }).from(resources).where(eq(resources.workspaceId, workspaceId)).all?.() ?? [];
        const resourceIds = resourceRows.map((r: any) => r.id);

        if (conversationIds.length > 0) {
          tx.delete(chat_messages).where(inArray(chat_messages.conversationId, conversationIds)).run?.();
        }

        tx.delete(conversations).where(eq(conversations.workspaceId, workspaceId)).run?.();

        tx.delete(workflowRuns).where(eq(workflowRuns.workspaceId, workspaceId)).run?.();

        tx.delete(workflows).where(eq(workflows.workspaceId, workspaceId)).run?.();

        if (resourceIds.length > 0) {
          tx.delete(rss_feed_items).where(inArray(rss_feed_items.rssResourceId, resourceIds)).run?.();
        }

        tx.delete(automation_rules).where(eq(automation_rules.workspaceId, workspaceId)).run?.();
        tx.delete(resource_tags).where(eq(resource_tags.workspaceId, workspaceId)).run?.();
        tx.delete(documents).where(eq(documents.workspaceId, workspaceId)).run?.();
        tx.delete(resources).where(eq(resources.workspaceId, workspaceId)).run?.();
        tx.delete(folders).where(eq(folders.workspaceId, workspaceId)).run?.();
        tx.delete(workspaces).where(eq(workspaces.id, workspaceId)).run?.();
      });
    } catch (error: any) {
      console.log(error);

      return { success: false, error: error?.message || '删除失败' };
    }
    console.log(rootPath);

    // 3. 安全删除工作空间文件夹
    if (!options?.keepFolder && rootPath && fs.existsSync(rootPath)) {
      try {
        const stat = await fsp.stat(rootPath);
        if (stat.isDirectory()) {
          const rootParsed = path.parse(rootPath);
          if (rootPath === rootParsed.root) {
            console.warn(`Refuse to delete root directory: ${rootPath}`);
          } else {
            const entries = await fsp.readdir(rootPath, { withFileTypes: true });
            const ignoredNames = new Set(['.DS_Store', 'Thumbs.db']);
            const meaningful = entries.filter((ent) => !ent.name.startsWith('.') && !ignoredNames.has(ent.name));
            const onlyResources = meaningful.length > 0 && meaningful.every((ent) => ent.name === 'resources');
            const resourcesPath = path.join(rootPath, 'resources');

            if (onlyResources) {
              console.log(rootPath);
              await fsp.rm(rootPath, { recursive: true, force: true });
            } else if (fs.existsSync(resourcesPath)) {
              console.log(resourcesPath);
              await fsp.rm(resourcesPath, { recursive: true, force: true });
            }
          }
        }
      } catch (error: any) {
        console.warn(`Failed to safely delete workspace folder: ${rootPath}`, error);
        // 文件系统删除失败不影响整体结果，因为数据库记录已经删除
      }
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || '删除失败' };
  }
}
