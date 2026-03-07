/**
 * 资源项目管理模块
 *
 * 为每个资源提供独立的项目文件夹，用于存储任务产物、缓存文件等。
 * 文件夹使用 .resproject 后缀，以便将来 macOS 可以将其注册为自定义包类型。
 *
 * 目录结构:
 * <workspace>/
 * └── projects/
 *     └── <resourceId>.resproject/
 *         ├── outputs/    # 任务产物（如导出文件）
 *         ├── cache/      # 缓存文件（如处理中间结果）
 *         ├── temp/       # 临时文件（如转写产物）
 *         └── data/       # 持久数据文件
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { WorkspacesRepo } from '../../db/repositories';

/** 项目子目录类型 */
export type ProjectSubDir = 'outputs' | 'cache' | 'temp' | 'data';

/** 项目元数据中的 segments 条目 */
export interface ProjectSegmentEntry {
  subtitleFile: string; // 字幕文件名，如 "video.zh.srt"
  segmentsFile: string; // segments 文件名，如 "video.zh.segments.json"
}

/** 项目元数据中的翻译条目 */
export interface ProjectTranslationEntry {
  id: string; // 翻译记录唯一 ID
  fileName: string; // 翻译文件名，如 "video.zh-CN.1234567890.json"
  targetLanguage?: string; // 目标语言，如 "zh-CN"
  providerId?: string; // AI 提供商 ID
  model?: string; // AI 模型名称
  translatedAt: number; // 翻译完成时间戳
  startTimestamp: number; // 翻译开始时间戳
}

/** 项目元数据中的轨道条目 */
export interface ProjectTrackEntry {
  id: string; // 轨道唯一 ID（如 "tts-abc123", "media-xyz789"）
  type: 'tts' | 'media'; // 轨道类型
  fileName: string; // 轨道配置文件名，如 "tts-abc123.json"
  title: string; // 轨道标题
  createdAt: number; // 创建时间戳
  updatedAt?: number; // 更新时间戳
}

/** 项目元数据 */
export interface ProjectMeta {
  version: number;
  resourceId: string;
  resourceType?: string; // 资源类型，如 "subtitle"
  createdAt: number;
  updatedAt?: number;
  parentResourceId?: string; // 父资源 ID
  segments?: ProjectSegmentEntry[]; // segments 文件列表
  translations?: ProjectTranslationEntry[]; // 翻译文件列表
  tracks?: ProjectTrackEntry[]; // 轨道配置文件列表
  [key: string]: unknown; // 允许扩展字段
}

/** 项目元数据文件名 */
const PROJECT_META_FILE = 'project.json';

/** 项目目录名称 */
const PROJECTS_DIR_NAME = 'projects';

/** 项目文件夹后缀（用于 macOS 包注册） */
const PROJECT_FOLDER_SUFFIX = '.resproject';

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
  // 添加后缀以支持 macOS 包注册
  return path.join(rootDir, `${resourceId}${PROJECT_FOLDER_SUFFIX}`);
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

  const dirsToCreate = subDirs || (['outputs', 'cache', 'temp', 'data'] as ProjectSubDir[]);
  const subDirPaths: Record<ProjectSubDir, string> = {
    outputs: path.join(projectPath, 'outputs'),
    cache: path.join(projectPath, 'cache'),
    temp: path.join(projectPath, 'temp'),
    data: path.join(projectPath, 'data')
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
      for (const dir of ['outputs', 'cache', 'temp', 'data'] as ProjectSubDir[]) {
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
    temp: { size: 0, count: 0 },
    data: { size: 0, count: 0 }
  };

  let totalSize = 0;
  let fileCount = 0;

  for (const dir of ['outputs', 'cache', 'temp', 'data'] as ProjectSubDir[]) {
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

// ==================== 项目元数据管理 ====================

/**
 * 读取项目元数据
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @returns 项目元数据，如果不存在则返回 null
 */
export async function readProjectMeta(resourceId: string, workspaceId: string): Promise<ProjectMeta | null> {
  try {
    const projectPath = await getResourceProjectPath(resourceId, workspaceId);
    if (!projectPath) return null;

    const metaPath = path.join(projectPath, PROJECT_META_FILE);
    if (!fs.existsSync(metaPath)) return null;

    const content = await fsp.readFile(metaPath, 'utf-8');
    return JSON.parse(content) as ProjectMeta;
  } catch (error) {
    console.warn('[resource-project] 读取项目元数据失败:', error);
    return null;
  }
}

/**
 * 写入项目元数据
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param meta 项目元数据（会与现有数据合并）
 */
export async function writeProjectMeta(resourceId: string, workspaceId: string, meta: Partial<ProjectMeta>): Promise<{ success: boolean; error?: string }> {
  try {
    // 确保项目目录存在
    const result = await ensureResourceProjectDir(resourceId, workspaceId);
    if (!result) {
      return { success: false, error: 'Failed to create project directory' };
    }

    const metaPath = path.join(result.path, PROJECT_META_FILE);

    // 读取现有元数据（如果存在）
    let existingMeta: ProjectMeta | null = null;
    if (fs.existsSync(metaPath)) {
      try {
        const content = await fsp.readFile(metaPath, 'utf-8');
        existingMeta = JSON.parse(content) as ProjectMeta;
      } catch {
        // 忽略解析错误
      }
    }

    // 合并元数据
    const now = Date.now();
    const newMeta: ProjectMeta = {
      version: 1,
      resourceId,
      createdAt: existingMeta?.createdAt || now,
      updatedAt: now,
      ...existingMeta,
      ...meta
    };

    // 确保 resourceId 不被覆盖
    newMeta.resourceId = resourceId;

    await fsp.writeFile(metaPath, JSON.stringify(newMeta, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 获取项目数据文件的完整路径
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param filename 文件名（相对于 data 目录）
 * @returns 文件完整路径
 */
export async function getProjectDataFilePath(resourceId: string, workspaceId: string, filename: string): Promise<string | null> {
  const projectPath = await getResourceProjectPath(resourceId, workspaceId);
  if (!projectPath) return null;
  return path.join(projectPath, 'data', filename);
}

/**
 * 读取项目数据文件
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param filename 文件名（相对于 data 目录）
 * @returns 文件内容，如果不存在则返回 null
 */
export async function readProjectDataFile(resourceId: string, workspaceId: string, filename: string): Promise<Buffer | null> {
  try {
    const filePath = await getProjectDataFilePath(resourceId, workspaceId, filename);
    if (!filePath || !fs.existsSync(filePath)) return null;

    return await fsp.readFile(filePath);
  } catch (error) {
    console.warn('[resource-project] 读取数据文件失败:', error);
    return null;
  }
}

/**
 * 读取项目数据文件（JSON 格式）
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param filename 文件名（相对于 data 目录）
 * @returns 解析后的 JSON 数据，如果不存在则返回 null
 */
export async function readProjectDataJson<T = unknown>(resourceId: string, workspaceId: string, filename: string): Promise<T | null> {
  try {
    const content = await readProjectDataFile(resourceId, workspaceId, filename);
    if (!content) return null;

    return JSON.parse(content.toString('utf-8')) as T;
  } catch (error) {
    console.warn('[resource-project] 读取 JSON 数据文件失败:', error);
    return null;
  }
}

/**
 * 写入项目数据文件
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param filename 文件名（相对于 data 目录）
 * @param content 文件内容
 */
export async function writeProjectDataFile(resourceId: string, workspaceId: string, filename: string, content: string | Buffer): Promise<{ success: boolean; error?: string }> {
  try {
    // 确保 data 目录存在
    const result = await ensureResourceProjectDir(resourceId, workspaceId, ['data']);
    if (!result) {
      return { success: false, error: 'Failed to create project data directory' };
    }

    const filePath = path.join(result.subDirs.data, filename);
    await fsp.writeFile(filePath, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ==================== 子目录数据文件操作 ====================

/**
 * 获取项目数据子目录文件的完整路径
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDirName 子目录名称（如 "segments", "translations"）
 * @param filename 文件名
 * @returns 文件完整路径
 */
export async function getProjectDataSubDirFilePath(resourceId: string, workspaceId: string, subDirName: string, filename: string): Promise<string | null> {
  const projectPath = await getResourceProjectPath(resourceId, workspaceId);
  if (!projectPath) return null;
  return path.join(projectPath, 'data', subDirName, filename);
}

/**
 * 读取项目数据子目录中的 JSON 文件
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDirName 子目录名称（如 "segments", "translations"）
 * @param filename 文件名
 * @returns 解析后的 JSON 数据，如果不存在则返回 null
 */
export async function readProjectDataJsonSubDir<T = unknown>(resourceId: string, workspaceId: string, subDirName: string, filename: string): Promise<T | null> {
  try {
    const filePath = await getProjectDataSubDirFilePath(resourceId, workspaceId, subDirName, filename);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.warn('[resource-project] 读取子目录 JSON 数据文件失败:', error);
    return null;
  }
}

/**
 * 写入项目数据子目录中的文件
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDirName 子目录名称（如 "segments", "translations"）
 * @param filename 文件名
 * @param content 文件内容
 */
export async function writeProjectDataSubDirFile(
  resourceId: string,
  workspaceId: string,
  subDirName: string,
  filename: string,
  content: string | Buffer
): Promise<{ success: boolean; error?: string }> {
  try {
    // 确保 data 目录存在
    const result = await ensureResourceProjectDir(resourceId, workspaceId, ['data']);
    if (!result) {
      return { success: false, error: 'Failed to create project data directory' };
    }

    // 创建子目录
    const subDirPath = path.join(result.subDirs.data, subDirName);
    if (!fs.existsSync(subDirPath)) {
      await fsp.mkdir(subDirPath, { recursive: true });
    }

    const filePath = path.join(subDirPath, filename);
    await fsp.writeFile(filePath, content);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ==================== Temp 子目录文件操作（用于波形等临时缓存） ====================

/**
 * 获取项目 temp 子目录中文件的完整路径
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDirName 子目录名称（如 "waveforms"）
 * @param filename 文件名
 * @returns 文件完整路径
 */
export async function getProjectTempSubDirFilePath(resourceId: string, workspaceId: string, subDirName: string, filename: string): Promise<string | null> {
  const projectPath = await getResourceProjectPath(resourceId, workspaceId);
  if (!projectPath) return null;
  return path.join(projectPath, 'temp', subDirName, filename);
}

/**
 * 读取项目 temp 子目录中的 JSON 文件
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDirName 子目录名称（如 "waveforms"）
 * @param filename 文件名
 * @returns 解析后的 JSON 数据，如果不存在则返回 null
 */
export async function readProjectTempSubDirJson<T = unknown>(resourceId: string, workspaceId: string, subDirName: string, filename: string): Promise<T | null> {
  try {
    const filePath = await getProjectTempSubDirFilePath(resourceId, workspaceId, subDirName, filename);
    if (!filePath || !fs.existsSync(filePath)) return null;

    const content = await fsp.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    console.warn('[resource-project] 读取 temp 子目录 JSON 文件失败:', error);
    return null;
  }
}

/**
 * 写入文件到项目 temp 子目录
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param subDirName 子目录名称（如 "waveforms"）
 * @param filename 文件名
 * @param content 文件内容
 */
export async function writeProjectTempSubDirFile(
  resourceId: string,
  workspaceId: string,
  subDirName: string,
  filename: string,
  content: string | Buffer
): Promise<{ success: boolean; error?: string; path?: string }> {
  try {
    // 确保 temp 目录存在
    const result = await ensureResourceProjectDir(resourceId, workspaceId, ['temp']);
    if (!result) {
      return { success: false, error: 'Failed to create project temp directory' };
    }

    // 创建子目录
    const subDirPath = path.join(result.subDirs.temp, subDirName);
    if (!fs.existsSync(subDirPath)) {
      await fsp.mkdir(subDirPath, { recursive: true });
    }

    const filePath = path.join(subDirPath, filename);
    await fsp.writeFile(filePath, content);
    return { success: true, path: filePath };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 复制文件到项目数据目录
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param srcPath 源文件路径
 * @param destFilename 目标文件名（相对于 data 目录）
 */
export async function copyFileToProjectData(resourceId: string, workspaceId: string, srcPath: string, destFilename: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!fs.existsSync(srcPath)) {
      return { success: false, error: 'Source file not found' };
    }

    // 确保 data 目录存在
    const result = await ensureResourceProjectDir(resourceId, workspaceId, ['data']);
    if (!result) {
      return { success: false, error: 'Failed to create project data directory' };
    }

    const destPath = path.join(result.subDirs.data, destFilename);
    await fsp.copyFile(srcPath, destPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 移动文件到项目数据目录（复制后删除源文件）
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param srcPath 源文件路径
 * @param destFilename 目标文件名（相对于 data 目录）
 */
export async function moveFileToProjectData(resourceId: string, workspaceId: string, srcPath: string, destFilename: string): Promise<{ success: boolean; error?: string; destPath?: string }> {
  try {
    if (!fs.existsSync(srcPath)) {
      return { success: false, error: 'Source file not found' };
    }

    // 确保 data 目录存在
    const result = await ensureResourceProjectDir(resourceId, workspaceId, ['data']);
    if (!result) {
      return { success: false, error: 'Failed to create project data directory' };
    }

    const destPath = path.join(result.subDirs.data, destFilename);
    await fsp.rename(srcPath, destPath);
    return { success: true, destPath };
  } catch (error) {
    // 如果跨设备移动失败，尝试复制+删除
    try {
      const result = await ensureResourceProjectDir(resourceId, workspaceId, ['data']);
      if (!result) {
        return { success: false, error: 'Failed to create project data directory' };
      }
      const destPath = path.join(result.subDirs.data, destFilename);
      await fsp.copyFile(srcPath, destPath);
      await fsp.unlink(srcPath);
      return { success: true, destPath };
    } catch (fallbackError) {
      return { success: false, error: String(fallbackError) };
    }
  }
}

/**
 * 移动文件到项目数据目录的子文件夹（复制后删除源文件）
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param srcPath 源文件路径
 * @param subDirName 子文件夹名称（如 "segments", "translations"）
 * @param destFilename 目标文件名
 */
export async function moveFileToProjectDataSubDir(
  resourceId: string,
  workspaceId: string,
  srcPath: string,
  subDirName: string,
  destFilename: string
): Promise<{ success: boolean; error?: string; destPath?: string }> {
  try {
    if (!fs.existsSync(srcPath)) {
      return { success: false, error: 'Source file not found' };
    }

    // 确保 data 目录存在
    const result = await ensureResourceProjectDir(resourceId, workspaceId, ['data']);
    if (!result) {
      return { success: false, error: 'Failed to create project data directory' };
    }

    // 创建子文件夹
    const subDirPath = path.join(result.subDirs.data, subDirName);
    if (!fs.existsSync(subDirPath)) {
      await fsp.mkdir(subDirPath, { recursive: true });
    }

    const destPath = path.join(subDirPath, destFilename);
    await fsp.rename(srcPath, destPath);
    return { success: true, destPath };
  } catch (error) {
    // 如果跨设备移动失败，尝试复制+删除
    try {
      const result = await ensureResourceProjectDir(resourceId, workspaceId, ['data']);
      if (!result) {
        return { success: false, error: 'Failed to create project data directory' };
      }

      const subDirPath = path.join(result.subDirs.data, subDirName);
      if (!fs.existsSync(subDirPath)) {
        await fsp.mkdir(subDirPath, { recursive: true });
      }

      const destPath = path.join(subDirPath, destFilename);
      await fsp.copyFile(srcPath, destPath);
      await fsp.unlink(srcPath);
      return { success: true, destPath };
    } catch (fallbackError) {
      return { success: false, error: String(fallbackError) };
    }
  }
}

/**
 * 检查项目数据文件是否存在
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param filename 文件名（相对于 data 目录）
 */
export async function projectDataFileExists(resourceId: string, workspaceId: string, filename: string): Promise<boolean> {
  const filePath = await getProjectDataFilePath(resourceId, workspaceId, filename);
  if (!filePath) return false;
  return fs.existsSync(filePath);
}

/**
 * 删除项目数据文件
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param filename 文件名（相对于 data 目录）
 */
export async function deleteProjectDataFile(resourceId: string, workspaceId: string, filename: string): Promise<{ success: boolean; error?: string }> {
  try {
    const filePath = await getProjectDataFilePath(resourceId, workspaceId, filename);
    if (!filePath || !fs.existsSync(filePath)) {
      return { success: true }; // 文件不存在视为成功
    }

    await fsp.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ==================== 轨道配置文件操作 ====================

/**
 * 列出项目中的所有轨道配置
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param type 可选，按类型过滤 ('tts' | 'media')
 * @returns 轨道条目数组
 */
export async function listProjectTracks(resourceId: string, workspaceId: string, type?: 'tts' | 'media'): Promise<ProjectTrackEntry[]> {
  const meta = await readProjectMeta(resourceId, workspaceId);
  if (!meta?.tracks) return [];

  if (type) {
    return meta.tracks.filter((t) => t.type === type);
  }
  return meta.tracks;
}

/**
 * 读取轨道配置文件
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param fileName 轨道配置文件名
 * @returns 轨道配置数据，如果不存在则返回 null
 */
export async function readProjectTrackConfig<T = unknown>(resourceId: string, workspaceId: string, fileName: string): Promise<T | null> {
  return readProjectDataJsonSubDir<T>(resourceId, workspaceId, 'tracks', fileName);
}

/**
 * 写入轨道配置文件并更新元数据
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param entry 轨道条目信息
 * @param config 轨道配置数据
 */
export async function writeProjectTrackConfig(resourceId: string, workspaceId: string, entry: ProjectTrackEntry, config: unknown): Promise<{ success: boolean; error?: string }> {
  try {
    // 写入配置文件
    const content = JSON.stringify(config, null, 2);
    const result = await writeProjectDataSubDirFile(resourceId, workspaceId, 'tracks', entry.fileName, content);
    if (!result.success) {
      return result;
    }

    // 更新项目元数据
    const meta = await readProjectMeta(resourceId, workspaceId);
    const existingTracks = meta?.tracks || [];

    // 检查是否已存在相同 ID 的轨道
    const existingIndex = existingTracks.findIndex((t) => t.id === entry.id);
    if (existingIndex >= 0) {
      existingTracks[existingIndex] = entry;
    } else {
      existingTracks.push(entry);
    }

    const metaResult = await writeProjectMeta(resourceId, workspaceId, { tracks: existingTracks });
    if (!metaResult.success) {
      return { success: false, error: metaResult.error };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 删除轨道配置文件并更新元数据
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param trackId 轨道 ID
 */
export async function deleteProjectTrack(resourceId: string, workspaceId: string, trackId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[deleteProjectTrack] 开始删除轨道: resourceId=${resourceId}, workspaceId=${workspaceId}, trackId=${trackId}`);

    // 获取元数据
    const meta = await readProjectMeta(resourceId, workspaceId);
    if (!meta?.tracks) {
      console.log(`[deleteProjectTrack] 没有轨道元数据`);
      return { success: true }; // 没有轨道，视为成功
    }

    // 查找轨道（支持双重前缀容错：如果 trackId 是 "tts-tts-xxx"，也尝试匹配 "tts-xxx"）
    let track = meta.tracks.find((t) => t.id === trackId);
    if (!track && trackId.startsWith('tts-tts-')) {
      // 尝试去掉多余的 "tts-" 前缀
      const normalizedId = trackId.replace(/^tts-tts-/, 'tts-');
      console.log(`[deleteProjectTrack] 尝试规范化 ID: ${trackId} -> ${normalizedId}`);
      track = meta.tracks.find((t) => t.id === normalizedId);
    }
    if (!track) {
      console.log(`[deleteProjectTrack] 轨道不存在: trackId=${trackId}`);
      return { success: true }; // 轨道不存在，视为成功
    }

    console.log(`[deleteProjectTrack] 找到轨道:`, track);

    // 删除配置文件
    const filePath = await getProjectDataSubDirFilePath(resourceId, workspaceId, 'tracks', track.fileName);
    console.log(`[deleteProjectTrack] 配置文件路径: ${filePath}`);
    if (filePath && fs.existsSync(filePath)) {
      console.log(`[deleteProjectTrack] 删除配置文件: ${filePath}`);
      await fsp.unlink(filePath);
    } else {
      console.log(`[deleteProjectTrack] 配置文件不存在或路径为空`);
    }

    // 如果是 TTS 轨道，删除对应的 TTS 音频文件夹
    if (track.type === 'tts') {
      const projectPath = await getResourceProjectPath(resourceId, workspaceId);
      if (projectPath) {
        // 使用 track.id（规范化后的 ID）来查找音频目录
        const ttsDir = path.join(projectPath, 'data', 'tts', track.id);
        console.log(`[deleteProjectTrack] TTS 音频目录: ${ttsDir}`);
        if (fs.existsSync(ttsDir)) {
          console.log(`[deleteProjectTrack] 删除 TTS 音频目录: ${ttsDir}`);
          await fsp.rm(ttsDir, { recursive: true, force: true });
        }
      }
    }

    // 更新元数据：使用 track.id（规范化后的 ID）来过滤
    const updatedTracks = meta.tracks.filter((t) => t.id !== track.id);
    const metaResult = await writeProjectMeta(resourceId, workspaceId, { tracks: updatedTracks });
    if (!metaResult.success) {
      console.log(`[deleteProjectTrack] 更新元数据失败:`, metaResult.error);
      return { success: false, error: metaResult.error };
    }

    console.log(`[deleteProjectTrack] 删除成功`);
    return { success: true };
  } catch (error) {
    console.error(`[deleteProjectTrack] 删除失败:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * 删除翻译文件并更新项目元数据
 * @param resourceId 字幕资源ID
 * @param workspaceId 工作空间ID
 * @param translationId 翻译条目 ID（project.json 中 translations 数组中的 id）
 */
export async function deleteProjectTranslation(resourceId: string, workspaceId: string, translationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[deleteProjectTranslation] 开始删除翻译: resourceId=${resourceId}, workspaceId=${workspaceId}, translationId=${translationId}`);

    // 获取元数据
    const meta = await readProjectMeta(resourceId, workspaceId);
    if (!meta?.translations) {
      console.log(`[deleteProjectTranslation] 没有翻译元数据`);
      return { success: true }; // 没有翻译，视为成功
    }

    // 查找翻译条目
    const translation = meta.translations.find((t) => t.id === translationId);
    if (!translation) {
      console.log(`[deleteProjectTranslation] 翻译不存在: translationId=${translationId}`);
      return { success: true }; // 翻译不存在，视为成功
    }

    console.log(`[deleteProjectTranslation] 找到翻译:`, translation);

    // 删除翻译文件
    const projectPath = await getResourceProjectPath(resourceId, workspaceId);
    if (projectPath) {
      const translationFilePath = path.join(projectPath, 'data', 'translations', translation.fileName);
      console.log(`[deleteProjectTranslation] 翻译文件路径: ${translationFilePath}`);
      if (fs.existsSync(translationFilePath)) {
        console.log(`[deleteProjectTranslation] 删除翻译文件: ${translationFilePath}`);
        await fsp.unlink(translationFilePath);
      } else {
        console.log(`[deleteProjectTranslation] 翻译文件不存在`);
      }
    }

    // 更新元数据：从 translations 数组中移除
    const updatedTranslations = meta.translations.filter((t) => t.id !== translationId);
    const metaResult = await writeProjectMeta(resourceId, workspaceId, { translations: updatedTranslations });
    if (!metaResult.success) {
      console.log(`[deleteProjectTranslation] 更新元数据失败:`, metaResult.error);
      return { success: false, error: metaResult.error };
    }

    console.log(`[deleteProjectTranslation] 删除成功`);
    return { success: true };
  } catch (error) {
    console.error(`[deleteProjectTranslation] 删除失败:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * 字幕编辑轨道片段数据结构
 */
export interface SubtitleEditSegment {
  st: string; // 开始时间，格式 "00:00:00,000"
  et: string; // 结束时间，格式 "00:00:00,000"
  text: string; // 文本内容
  index: number; // 片段索引
}

/**
 * 更新字幕编辑轨道的片段数据
 * @param resourceId 资源ID
 * @param workspaceId 工作空间ID
 * @param trackId 轨道 ID
 * @param segments 更新后的片段数组
 */
export async function updateSubtitleEditTrackSegments(resourceId: string, workspaceId: string, trackId: string, segments: SubtitleEditSegment[]): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[updateSubtitleEditTrackSegments] 更新轨道片段: resourceId=${resourceId}, trackId=${trackId}, segments=${segments.length}`);

    // 获取元数据
    const meta = await readProjectMeta(resourceId, workspaceId);
    if (!meta?.tracks) {
      return { success: false, error: '没有轨道元数据' };
    }

    // 查找轨道
    const track = meta.tracks.find((t) => t.id === trackId);
    if (!track) {
      return { success: false, error: '轨道不存在' };
    }

    // 读取现有配置
    const config = await readProjectTrackConfig<{ translatedSegments?: SubtitleEditSegment[];[key: string]: unknown }>(resourceId, workspaceId, track.fileName);
    if (!config) {
      return { success: false, error: '轨道配置文件不存在' };
    }

    // 更新片段数据
    config.translatedSegments = segments;

    // 写回配置文件
    const content = JSON.stringify(config, null, 2);
    const result = await writeProjectDataSubDirFile(resourceId, workspaceId, 'tracks', track.fileName, content);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    // 更新元数据中的 updatedAt
    const updatedTracks = meta.tracks.map((t) => (t.id === trackId ? { ...t, updatedAt: Date.now() } : t));
    await writeProjectMeta(resourceId, workspaceId, { tracks: updatedTracks });

    console.log(`[updateSubtitleEditTrackSegments] 更新成功`);
    return { success: true };
  } catch (error) {
    console.error(`[updateSubtitleEditTrackSegments] 更新失败:`, error);
    return { success: false, error: String(error) };
  }
}
