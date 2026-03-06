/**
 * 资源项目管理模块
 *
 * 为每个资源提供独立的项目文件夹，用于存储任务产物、缓存文件等。
 *
 * 目录结构:
 * <workspace>/
 * └── projects/
 *     └── <resourceId>/
 *         ├── outputs/    # 任务产物（如导出文件）
 *         ├── cache/      # 缓存文件（如处理中间结果）
 *         └── temp/       # 临时文件
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { WorkspacesRepo } from '../../db/repositories';

/** 项目子目录类型 */
export type ProjectSubDir = 'outputs' | 'cache' | 'temp';

/** 项目目录名称 */
const PROJECTS_DIR_NAME = 'projects';

/**
 * 获取工作空间的项目根目录路径
 * @param workspaceId 工作空间ID
 * @returns 项目根目录路径，如果工作空间不存在则返回 null
 */
export async function getProjectsRootDir(workspaceId: string): Promise<string | null> {
  const ws = await WorkspacesRepo.getById(workspaceId);
  if (!ws?.rootPath) return null;
  return path.join(ws.rootPath, PROJECTS_DIR_NAME);
}

/**
 * 获取资源的项目目录路径
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @returns 资源项目目录路径
 */
export async function getResourceProjectPath(resourceId: string, workspaceId: string): Promise<string | null> {
  const rootDir = await getProjectsRootDir(workspaceId);
  if (!rootDir) return null;
  return path.join(rootDir, resourceId);
}

/**
 * 确保资源项目目录存在，并返回路径
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDirs 要创建的子目录，默认创建所有
 * @returns 资源项目目录路径
 */
export async function ensureResourceProjectDir(resourceId: string, workspaceId: string, subDirs?: ProjectSubDir[]): Promise<{ path: string; subDirs: Record<ProjectSubDir, string> } | null> {
  const projectPath = await getResourceProjectPath(resourceId, workspaceId);
  if (!projectPath) return null;

  const dirsToCreate = subDirs || (['outputs', 'cache', 'temp'] as ProjectSubDir[]);
  const subDirPaths: Record<ProjectSubDir, string> = {
    outputs: path.join(projectPath, 'outputs'),
    cache: path.join(projectPath, 'cache'),
    temp: path.join(projectPath, 'temp')
  };

  // 创建主目录
  if (!fs.existsSync(projectPath)) {
    await fsp.mkdir(projectPath, { recursive: true });
  }

  // 创建子目录
  for (const dir of dirsToCreate) {
    const dirPath = subDirPaths[dir];
    if (!fs.existsSync(dirPath)) {
      await fsp.mkdir(dirPath, { recursive: true });
    }
  }

  return { path: projectPath, subDirs: subDirPaths };
}

/**
 * 清空资源项目目录（删除所有内容但保留目录结构）
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDir 可选，只清空指定子目录
 */
export async function clearResourceProjectDir(resourceId: string, workspaceId: string, subDir?: ProjectSubDir): Promise<{ success: boolean; error?: string }> {
  try {
    const projectPath = await getResourceProjectPath(resourceId, workspaceId);
    if (!projectPath || !fs.existsSync(projectPath)) {
      return { success: true }; // 目录不存在视为成功
    }

    const cleanDir = async (dirPath: string): Promise<void> => {
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await fsp.rm(fullPath, { recursive: true, force: true });
        } else {
          await fsp.unlink(fullPath);
        }
      }
    };

    if (subDir) {
      const subDirPath = path.join(projectPath, subDir);
      if (fs.existsSync(subDirPath)) {
        await cleanDir(subDirPath);
      }
    } else {
      // 清空所有子目录
      for (const dir of ['outputs', 'cache', 'temp'] as ProjectSubDir[]) {
        const subDirPath = path.join(projectPath, dir);
        if (fs.existsSync(subDirPath)) {
          await cleanDir(subDirPath);
        }
      }
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 删除资源项目目录（完全删除）
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 */
export async function deleteResourceProjectDir(resourceId: string, workspaceId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const projectPath = await getResourceProjectPath(resourceId, workspaceId);
    if (!projectPath || !fs.existsSync(projectPath)) {
      return { success: true }; // 目录不存在视为成功
    }

    await fsp.rm(projectPath, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 获取资源项目目录的统计信息
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 */
export async function getResourceProjectStats(
  resourceId: string,
  workspaceId: string
): Promise<{ exists: boolean; totalSize: number; fileCount: number; subDirs?: Record<ProjectSubDir, { size: number; count: number }> } | null> {
  const projectPath = await getResourceProjectPath(resourceId, workspaceId);
  if (!projectPath) return null;

  if (!fs.existsSync(projectPath)) {
    return { exists: false, totalSize: 0, fileCount: 0 };
  }

  const calculateDirSize = async (dirPath: string): Promise<{ size: number; count: number }> => {
    let size = 0;
    let count = 0;

    const walk = async (p: string): Promise<void> => {
      const entries = await fsp.readdir(p, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(p, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile()) {
          try {
            const stat = await fsp.stat(fullPath);
            size += stat.size;
            count++;
          } catch {
            // ignore
          }
        }
      }
    };

    try {
      await walk(dirPath);
    } catch {
      // ignore
    }

    return { size, count };
  };

  const subDirs: Record<ProjectSubDir, { size: number; count: number }> = {
    outputs: { size: 0, count: 0 },
    cache: { size: 0, count: 0 },
    temp: { size: 0, count: 0 }
  };

  let totalSize = 0;
  let fileCount = 0;

  for (const dir of ['outputs', 'cache', 'temp'] as ProjectSubDir[]) {
    const subDirPath = path.join(projectPath, dir);
    if (fs.existsSync(subDirPath)) {
      const stats = await calculateDirSize(subDirPath);
      subDirs[dir] = stats;
      totalSize += stats.size;
      fileCount += stats.count;
    }
  }

  return { exists: true, totalSize, fileCount, subDirs };
}

/**
 * 在资源项目目录中创建自定义子目录
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param dirName 子目录名称
 */
export async function createCustomProjectSubDir(resourceId: string, workspaceId: string, dirName: string): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    // 安全检查：防止路径遍历
    const safeName = path.basename(dirName);
    if (safeName !== dirName || dirName.startsWith('.') || dirName.includes('..')) {
      return { success: false, error: 'Invalid directory name' };
    }

    const result = await ensureResourceProjectDir(resourceId, workspaceId);
    if (!result) {
      return { success: false, error: 'Failed to create project directory' };
    }

    const customDir = path.join(result.path, dirName);
    if (!fs.existsSync(customDir)) {
      await fsp.mkdir(customDir, { recursive: true });
    }

    return { success: true, path: customDir };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
