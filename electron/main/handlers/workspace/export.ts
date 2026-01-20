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

export type ImportStrategy = 'new' | 'restore' | 'overwrite';

export interface ImportOptions {
  sourcePath: string;
  name: string;
  rootPath: string;
  strategy: ImportStrategy; // 导入策略
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
      db
        .select()
        .from(workflowRuns)
        .where(inArray(workflowRuns.workflowId, db.select({ id: workflows.id }).from(workflows).where(eq(workflows.workspaceId, workspaceId)))),
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
        // 是目录，检查是否为空
        const entries = await fsp.readdir(destPath);
        if (entries.length > 0) {
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
 * @param newWorkspaceName 新工作空间名称
 * @param newWorkspaceRoot 新工作空间根目录
 * @returns 导入结果
 */
export async function importWorkspace(sourcePath: string, newWorkspaceName: string, newWorkspaceRoot: string): Promise<{ success: boolean; workspaceId?: string; error?: string }> {
  const db = getOrm();

  try {
    // 1. 读取数据
    const dataJsonPath = path.join(sourcePath, 'workspace-data.json');
    if (!fs.existsSync(dataJsonPath)) {
      return { success: false, error: '无效的工作空间导出文件：找不到 workspace-data.json' };
    }

    const dataContent = await fsp.readFile(dataJsonPath, 'utf-8');
    const exportData: WorkspaceExportData = JSON.parse(dataContent);

    // 修改导出数据中的根路径为新的路径
    exportData.workspace.rootPath = sourcePath;

    // 2. 检查目标路径是否已被使用
    const existingByPath = await db.select().from(workspaces).where(eq(workspaces.rootPath, newWorkspaceRoot)).limit(1);
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

    // 4. 导入工作空间（在事务中执行）
    return await (db as any).transaction(async (tx: any) => {
      // 生成新的工作空间ID
      const newWorkspaceId = randomUUID();
      idMappings.workspaceId = newWorkspaceId;

      // 创建工作空间
      await tx.insert(workspaces).values({
        id: newWorkspaceId,
        name: exportData.workspace.name,
        rootPath: exportData.workspace.rootPath,
        description: exportData.workspace.description,
        isDefault: 0, // 导入的工作空间默认不设为默认
        status: 'active',
        metadata: exportData.workspace.metadata,
        createdAt: exportData.workspace.createdAt,
        updatedAt: Date.now()
      } as any);

      // 4. 导入文件夹（需要处理父子关系）
      for (const folder of exportData.folders) {
        const newId = randomUUID();
        idMappings.folders.set(folder.id, newId);
      }

      for (const folder of exportData.folders) {
        const newId = idMappings.folders.get(folder.id)!;
        const newParentId = folder.parentId ? idMappings.folders.get(folder.parentId) : null;
        await tx.insert(folders).values({
          id: newId,
          name: folder.name,
          description: folder.description,
          parentId: newParentId,
          workspaceId: newWorkspaceId,
          metadata: folder.metadata,
          rank: folder.rank,
          createdAt: folder.createdAt,
          updatedAt: Date.now()
        } as any);
        // 文件夹都放在导入路径 sourcePath 的 resources/folders 目录下，都是以 ID 命名的，
        // 因此在插入新的文件夹 ID 的时候，要把旧的文件夹 ID 名称改成新的 ID 名称。
        // 如果目标目录已存在则把旧目录内容合并到目标目录并删除旧目录；如果旧目录不存在则忽略。
        try {
          const foldersDir = path.join(sourcePath, 'resources', 'folders');
          const oldFolderPath = path.join(foldersDir, folder.id);
          const newFolderPath = path.join(foldersDir, newId);

          console.log(oldFolderPath, '->', newFolderPath);

          if (fs.existsSync(oldFolderPath)) {
            // 目标不存在时直接改名，存在时合并内容
            if (!fs.existsSync(newFolderPath)) {
              await fsp.mkdir(path.dirname(newFolderPath), { recursive: true });
              await fsp.rename(oldFolderPath, newFolderPath);
            } else {
              // 合并旧目录到新目录，然后删除旧目录
              await copyDirectory(oldFolderPath, newFolderPath);
              // 使用 rm 删除旧目录（force + recursive）
              await fsp.rm(oldFolderPath, { recursive: true, force: true } as any);
            }
          }
        } catch (err: any) {
          // 不要让文件系统操作阻止数据库事务完成，记录警告后继续
          console.warn(`Failed to rename/merge folder directory for ${folder.id} -> ${newId}:`, err?.message || err);
        }
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

        await tx.insert(resources).values({
          ...resource,
          id: newId,
          workspaceId: newWorkspaceId,
          folderId: newFolderId,
          parentResourceId: newParentResourceId,
          filePath: resolveResourcePath(resource.filePath),
          thumbnailPath: resolveResourcePath(resource.thumbnailPath),
          createdAt: resource.createdAt,
          updatedAt: Date.now()
        } as any);
      }
      console.log(exportData.workspace);
      return { success: true, workspaceId: newWorkspaceId };

      // 6. 导入文档
      for (const document of exportData.documents) {
        const newId = randomUUID();
        idMappings.documents.set(document.id, newId);

        const newSourceId = document.sourceId ? idMappings.resources.get(document.sourceId) : null;
        const newParentId = document.parentId ? idMappings.documents.get(document.parentId) : null;

        await tx.insert(documents).values({
          ...document,
          id: newId,
          workspaceId: newWorkspaceId,
          sourceId: newSourceId,
          parentId: newParentId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as any);
      }

      // 7. 导入资源标签
      for (const tag of exportData.resourceTags) {
        const newResourceId = idMappings.resources.get(tag.resourceId);
        if (newResourceId) {
          await tx.insert(resource_tags).values({
            id: randomUUID(),
            resourceId: newResourceId,
            workspaceId: newWorkspaceId,
            tag: tag.tag,
            createdAt: Date.now()
          } as any);
        }
      }

      // 8. 导入对话
      for (const conversation of exportData.conversations) {
        const newId = randomUUID();
        idMappings.conversations.set(conversation.id, newId);

        await tx.insert(conversations).values({
          ...conversation,
          id: newId,
          workspaceId: newWorkspaceId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as any);
      }

      // 9. 导入对话消息
      for (const message of exportData.chatMessages) {
        const newConversationId = idMappings.conversations.get(message.conversationId);
        if (newConversationId) {
          await tx.insert(chat_messages).values({
            ...message,
            id: randomUUID(),
            conversationId: newConversationId,
            createdAt: Date.now(),
            updatedAt: Date.now()
          } as any);
        }
      }

      // 10. 导入工作流
      for (const workflow of exportData.workflows) {
        const newId = randomUUID();
        idMappings.workflows.set(workflow.id, newId);

        await tx.insert(workflows).values({
          ...workflow,
          id: newId,
          workspaceId: newWorkspaceId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as any);
      }

      // 11. 导入工作流运行记录
      for (const run of exportData.workflowRuns) {
        const newWorkflowId = idMappings.workflows.get(run.workflowId);
        if (newWorkflowId) {
          await tx.insert(workflowRuns).values({
            ...run,
            id: randomUUID(),
            workflowId: newWorkflowId
          } as any);
        }
      }

      // 12. 导入自动化规则
      for (const rule of exportData.automationRules) {
        await tx.insert(automation_rules).values({
          ...rule,
          id: randomUUID(),
          workspaceId: newWorkspaceId,
          createdAt: Date.now(),
          updatedAt: Date.now()
        } as any);
      }

      // 13. 导入RSS订阅条目
      for (const item of exportData.rssFeedItems) {
        const newRssResourceId = idMappings.resources.get(item.rssResourceId);
        const newLocalResourceId = item.localResourceId ? idMappings.resources.get(item.localResourceId) : null;

        if (newRssResourceId) {
          await tx.insert(rss_feed_items).values({
            ...item,
            id: randomUUID(),
            rssResourceId: newRssResourceId,
            localResourceId: newLocalResourceId,
            createdAt: Date.now()
          } as any);
        }
      }

      // 14. 复制文件
      const filesDir = path.join(sourcePath, 'files');
      if (fs.existsSync(filesDir)) {
        await fsp.mkdir(newWorkspaceRoot, { recursive: true });
        await copyDirectory(filesDir, newWorkspaceRoot);
      }

      return { success: true, workspaceId: newWorkspaceId };
    });
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
