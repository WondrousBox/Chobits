import { randomUUID } from 'node:crypto';
import * as fscb from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import { utils } from '@aim-packages/subtitle';
import dayjs from 'dayjs';
import { BrowserWindow } from 'electron';

import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { FoldersRepo, ResourcesRepo, WorkspacesRepo } from '../../db/repositories';
import { detectBasicType, generateThumbnailForResource } from '../../utils/thumbnail';
import { embeddingQueue } from '../embedding/queue';
import type { Resource } from './ipc-renderer';

const SCREENSHOT_FOLDER_NAME = '截图';

/**
 * 查找字幕文件的伴随 segments.json 文件路径。
 * 命名约定：与字幕文件同目录、同 basename，后缀为 `.segments.json`。
 * 例如：`video.srt` → `video.segments.json`
 */
function findCompanionSegmentsPath(subtitleFilePath: string): string | null {
  const dir = path.dirname(subtitleFilePath);
  const baseName = path.basename(subtitleFilePath, path.extname(subtitleFilePath));
  const segmentsPath = path.join(dir, `${baseName}.segments.json`);
  if (fscb.existsSync(segmentsPath)) {
    return segmentsPath;
  }
  return null;
}

/**
 * 为字幕资源创建伴随的 segments.json 子资源。
 * segments.json 包含字级时间戳等详细分段信息，类似于 JavaScript 的 source map，
 * 方便后续查询字幕文件的详细时间轴数据。
 *
 * @param parentRow  已创建的字幕资源行
 * @param originalFilePath  原始字幕文件路径（复制前）
 * @param currentFilePath   当前字幕文件路径（可能已复制到工作空间）
 * @param workspaceId  工作空间 ID
 * @param folderId  文件夹 ID
 */
async function createSegmentsChildResource(
  parentRow: any,
  originalFilePath: string,
  currentFilePath: string | undefined,
  workspaceId: string | undefined,
  folderId: string | undefined
): Promise<void> {
  // 1. 在原始路径查找伴随文件
  let segmentsSourcePath = findCompanionSegmentsPath(originalFilePath);

  // 2. 如果原始路径没有，尝试在当前路径（工作空间复制后的位置）查找
  if (!segmentsSourcePath && currentFilePath && currentFilePath !== originalFilePath) {
    segmentsSourcePath = findCompanionSegmentsPath(currentFilePath);
  }

  if (!segmentsSourcePath) return;

  console.log('[addResource] 找到字幕伴随 segments 文件:', segmentsSourcePath);

  // 3. 确定 segments 文件的目标路径（与字幕文件在同一目录）
  const subtitleDir = currentFilePath ? path.dirname(currentFilePath) : path.dirname(originalFilePath);
  const subtitleBaseName = path.basename(currentFilePath || originalFilePath, path.extname(currentFilePath || originalFilePath));
  const segmentsTargetPath = path.join(subtitleDir, `${subtitleBaseName}.segments.json`);

  // 4. 如果源文件和目标不同，复制到工作空间
  if (segmentsSourcePath !== segmentsTargetPath) {
    try {
      await fs.copyFile(segmentsSourcePath, segmentsTargetPath);
      console.log('[addResource] segments 文件已复制到:', segmentsTargetPath);
    } catch (e) {
      console.warn('[addResource] 复制 segments 文件失败:', e);
      return;
    }
  }

  // 5. 创建子资源记录（type: 'segments' 为隐藏资源类型，不在普通列表中显示）
  const segmentsStats = fscb.statSync(segmentsTargetPath);
  const childResource = {
    type: 'segments' as const,
    title: `${subtitleBaseName}.segments.json`,
    filePath: segmentsTargetPath,
    mimeType: 'application/json',
    sizeBytes: segmentsStats.size,
    parentResourceId: parentRow.id,
    workspaceId,
    folderId,
    status: 'ready' as const,
    description: '字幕分段时间戳数据（segments map）'
  };

  const childRow = await ResourcesRepo.upsert(childResource as any);
  if (childRow) {
    console.log('[addResource] segments 子资源已创建, id:', childRow.id, ', parentId:', parentRow.id);
    eventManager.emit(AppEvent.RESOURCE_CREATED, childRow);
  }
}

/**
 * 获取或创建「截图」文件夹（主进程）：位于当前资源所在层级，用于统一存放截图资源。
 */
export async function getOrCreateScreenshotFolder(workspaceId: string | undefined, parentFolderId: string | null | undefined): Promise<string | null> {
  let ws: any;
  if (workspaceId) {
    ws = await WorkspacesRepo.getById(workspaceId);
  } else {
    ws = await WorkspacesRepo.getDefault();
  }
  if (!ws?.id || !ws.rootPath) return null;
  const wsId = ws.id;
  const parentId = parentFolderId ?? null;

  const siblings = await FoldersRepo.list({ workspaceId: wsId, parentId, deletedAt: 0 } as any, 2000, 0);
  const existing = (siblings as any[]).find((s: any) => s.name === SCREENSHOT_FOLDER_NAME);
  if (existing?.id) return existing.id;

  const row = await FoldersRepo.create({ name: SCREENSHOT_FOLDER_NAME, parentId, workspaceId: wsId } as any);
  const baseDir = path.join(ws.rootPath, 'resources', 'folders');
  await fs.mkdir(baseDir, { recursive: true });
  const dirPath = path.join(baseDir, row.id);
  await fs.mkdir(dirPath, { recursive: true });
  eventManager.emit(AppEvent.FOLDER_CREATED, row);
  return row.id;
}

export async function ensureDailyFolder(workspaceId: string, rootPath: string): Promise<string> {
  const today = dayjs().format('YYYY-MM-DD');
  // Check if folder exists in DB
  // 只在“未删除”的顶层文件夹中查找，避免命中回收站里的文件夹
  const siblings = await FoldersRepo.list({ workspaceId, parentId: null, deletedAt: 0 } as any, 2000, 0);
  const existing = siblings.find((s: any) => s.name === today);

  if (existing) {
    return existing.id;
  }

  // Create new folder
  const newFolder = {
    id: randomUUID(),
    name: today,
    parentId: null,
    workspaceId
  };

  await FoldersRepo.create(newFolder as any);

  // Create directory
  const dirPath = path.join(rootPath, 'resources', 'folders', newFolder.id);
  await fs.mkdir(dirPath, { recursive: true });

  eventManager.emit(AppEvent.FOLDER_CREATED, newFolder);

  return newFolder.id;
}

export async function addResource(r: { resource: Resource }): Promise<{ success: boolean; data: Resource | null }> {
  const res = r.resource || {};
  console.log(res);

  res.status = 'new';

  if (!res.title && res.contentText) {
    res.title = res.contentText.slice(0, 40);
  }

  // Attach workspace: copy local file into default workspace if available
  let workspaceId = res.workspaceId;
  let filePath = res.filePath as string | undefined;
  const originalFilePath = filePath; // 记录原始路径，用于查找伴随文件（如 .segments.json）
  let folderId = res.folderId;

  try {
    let ws;
    if (workspaceId) {
      ws = await WorkspacesRepo.getById(workspaceId);
    } else {
      ws = await WorkspacesRepo.getDefault();
      if (ws) workspaceId = ws.id;
    }

    // 统一：只要有工作空间根目录且未显式指定 folderId，就默认放到当天的文件夹下
    if (ws && ws.id && ws.rootPath) {
      if (!folderId) {
        try {
          folderId = await ensureDailyFolder(ws.id, ws.rootPath);
          res.folderId = folderId;
        } catch (e) {
          console.warn('Failed to ensure daily folder', e);
        }
      }

      // 对有物理文件的资源，仍然执行复制到工作空间的逻辑
      if (filePath) {
        try {
          const base = path.basename(filePath);
          let targetDir;
          if (folderId) {
            targetDir = path.join(ws.rootPath, 'resources', 'folders', folderId);
          } else {
            targetDir = path.join(ws.rootPath, 'resources');
          }

          await fs.mkdir(targetDir, { recursive: true });
          let target = path.join(targetDir, base);
          if (filePath !== target) {
            // Avoid overwriting existing files
            if (fscb.existsSync(target)) {
              const ext = path.extname(base);
              const name = path.basename(base, ext);
              let i = 1;
              while (fscb.existsSync(path.join(targetDir, `${name}(${i})${ext}`))) {
                i++;
              }
              target = path.join(targetDir, `${name}(${i})${ext}`);
            }
            await fs.copyFile(filePath, target);
            // 复制字幕伴随文件（.segments.json）
            try {
              const ext = path.extname(filePath).toLowerCase();
              const subtitleExts = ['.srt', '.vtt', '.ass', '.ssa'];
              if (subtitleExts.includes(ext)) {
                const srcBase = path.basename(filePath, path.extname(filePath));
                const srcDir = path.dirname(filePath);
                const segmentsSource = path.join(srcDir, `${srcBase}.segments.json`);
                if (fscb.existsSync(segmentsSource)) {
                  const destBase = path.basename(target, path.extname(target));
                  const segmentsTarget = path.join(targetDir, `${destBase}.segments.json`);
                  await fs.copyFile(segmentsSource, segmentsTarget);
                  console.log('[addResource] 已复制字幕伴随 segments 文件:', segmentsTarget);
                }
              }
            } catch (segErr) {
              console.warn('[addResource] 复制伴随 segments 文件失败:', segErr);
            }
            filePath = target;
          }
        } catch (e) {
          console.warn('[workspace] copy file into workspace failed', e);
        }
      }
    }
  } catch (e) {
    console.warn('[addResource] add resource failed', e);
  }

  // 渲染进程不负责维护时间字段，避免覆盖数据库默认值
  try {
    // 仅清理创建/更新时间；collectedAt 允许由主进程内部逻辑（如批量导入任务）自行设置
    delete res.createdAt;
    delete res.updatedAt;
  } catch {
    // ignore
  }

  // 没有本地路径的文件，就是纯文本文件
  if (!res.type && !res.filePath && res.contentText && typeof res.contentText === 'string') {
    res.type = 'text';
    res.mimeType = 'text/plain';
    const buf = Buffer.from(res.contentText as string, 'utf8');
    res.sizeBytes = buf.byteLength;
  }

  // Basic file type detection（统一在主进程侧决策资源类型）
  const detected = filePath ? detectBasicType(filePath) : undefined;

  // 1. 先用文件路径做基础类型判断
  let finalType: Resource['type'] = res.type || detected?.type;

  // 2. 若仍未能确定类型，则根据内容/URL 做进一步兜底判断
  if (!finalType) {
    const hasTextContent = typeof res.contentText === 'string' && (res as any).contentText.trim().length > 0;
    if (hasTextContent) {
      finalType = 'text';
    } else if (res.url) {
      finalType = 'link';
    } else {
      // 最后兜底为 file，保证写入数据库时 type 一定有值
      finalType = 'file';
    }
  }

  res.type = finalType as any;

  if (!res.mimeType && detected?.mimeType) res.mimeType = detected.mimeType;

  const row = await ResourcesRepo.upsert({ ...res, workspaceId, filePath } as any);

  // 首次创建且未显式设置 collectedAt 时，用 createdAt 回填采集时间
  try {
    if (row && !row.collectedAt && row.createdAt) {
      await ResourcesRepo.update(row.id, { collectedAt: row.createdAt } as any);
    }
  } catch {
    // 不影响主流程
  }

  // // Fire-and-forget: auto-tag text resources via AI TaggingService (no renderer involvement)
  // try {
  //   const text = (res as any).contentText || (res as any).description || (res as any).title || '';
  //   const textStr = (typeof text === 'string' ? text : '').trim();
  //   if (row && textStr) {
  //     setTimeout(async () => {
  //       try {
  //         const tags = await TaggingService.autoTagText(textStr, { maxLabels: 8 });
  //         if (Array.isArray(tags) && tags.length) {
  //           try {
  //             await ResourcesRepo.update((row as any).id, { tags: JSON.stringify(tags) } as any);
  //           } catch {
  //             /* ignore update errors */
  //           }
  //         }
  //       } catch (e) {
  //         console.warn('[auto-tag] failed', e);
  //       }
  //     }, 0);
  //   }
  // } catch {
  //   /* ignore auto-tag failures */
  // }

  // Conditionally enqueue embedding only for text-like resources
  if (res.type === 'text') {
    const text = res.contentText || res.description || res.title;
    if (typeof text === 'string' && text.trim().length > 0 && row) {
      try {
        const chunks = utils.chunkText(text);
        const items = chunks.map((c) => ({
          id: `${row.id}#${c.index}`,
          content: c.content,
          metadata: { parentId: row.id, chunkIndex: c.index, chunkCount: c.count, source: 'resource' }
        }));
        embeddingQueue.enqueue({ items, dim: 384, batchSize: 16 });
      } catch (e) {
        console.warn('[embedding] enqueue failed', e);
      }
    }
  }

  // 生成缩略图
  if (row && !row.thumbnailPath) {
    try {
      const ws = await WorkspacesRepo.getDefault();
      const baseDir = ws?.rootPath ? path.join(ws.rootPath, 'resources', '.thumbs') : path.join(process.cwd(), 'uploads', '.thumbs');
      await fs.mkdir(baseDir, { recursive: true });

      console.log(res);

      const thumb = await generateThumbnailForResource({ filePath, type: res.type, title: res.title });
      if (thumb) {
        const thumbPath = path.join(baseDir, `${row.id}.png`);
        await fs.writeFile(thumbPath, thumb);
        await ResourcesRepo.update(row.id, { thumbnailPath: thumbPath } as any);
        const updated = await ResourcesRepo.getById(row.id);
        // Broadcast insert event to all renderer windows
        const resData: any = updated || row;
        eventManager.emit(AppEvent.RESOURCE_CREATED, resData);

        const payload = { action: 'inserted', id: resData?.id, resource: resData };
        BrowserWindow.getAllWindows().forEach((w) => {
          w.webContents.send('resource:inserted', payload);
          w.webContents.send('resource:changed', payload);
        });

        // 字幕资源伴随文件处理（缩略图分支）
        if ((finalType as string) === 'subtitle' && originalFilePath) {
          try {
            await createSegmentsChildResource(row, originalFilePath, filePath, workspaceId, folderId);
          } catch (e) {
            console.warn('[addResource] segments child resource creation failed', e);
          }
        }

        return { success: true, data: (updated || row) as Resource };
      }
    } catch (e) {
      console.warn('[thumbnail] generation failed', e);
    }
  }
  // Broadcast insert event to all renderer windows
  try {
    if (row) {
      eventManager.emit(AppEvent.RESOURCE_CREATED, row);

      const payload2 = { action: 'inserted', id: (row as any).id, resource: row };
      BrowserWindow.getAllWindows().forEach((w) => {
        w.webContents.send('resource:inserted', payload2);
        w.webContents.send('resource:changed', payload2);
      });
    }
  } catch {
    /* ignore */
  }

  // 字幕资源伴随文件处理：如果创建的是字幕资源，检查是否存在伴随的 .segments.json 文件
  // segments.json 包含字级时间戳等详细分段信息，类似于 JavaScript 的 source map
  if (row && (finalType as string) === 'subtitle' && originalFilePath) {
    try {
      await createSegmentsChildResource(row, originalFilePath, filePath, workspaceId, folderId);
    } catch (e) {
      console.warn('[addResource] segments child resource creation failed', e);
    }
  }

  return { success: true, data: row as Resource };
}
