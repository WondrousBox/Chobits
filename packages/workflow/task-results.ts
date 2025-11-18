/**
 * 工作流任务结果管理
 * - 统一管理工作流任务生成的文件
 * - 基于输入文件路径，在同级目录下按类型组织文件
 * - 自动识别和分类任务结果
 */

import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export type TaskResultType = 'transcode' | 'transcribe' | 'keyframes' | 'other';

export interface TaskResultFile {
  path: string;
  name: string;
  type: TaskResultType;
  size: number;
  createdAt: number;
  modifiedAt: number;
}

export interface TaskResults {
  transcode: TaskResultFile[];
  transcribe: TaskResultFile[];
  keyframes: TaskResultFile[];
  other: TaskResultFile[];
}

/**
 * 获取输入文件所在目录
 * @param inputFilePath 输入文件路径
 */
export function getInputFileDir(inputFilePath: string): string {
  return path.dirname(inputFilePath);
}

/**
 * 获取特定类型任务结果的目录路径（基于输入文件路径）
 * @param inputFilePath 输入文件路径
 * @param type 任务类型
 */
export function getTaskTypeDir(inputFilePath: string, type: TaskResultType): string {
  const inputDir = getInputFileDir(inputFilePath);
  return path.join(inputDir, type);
}

/**
 * 确保特定类型任务结果目录存在
 * @param inputFilePath 输入文件路径
 * @param type 任务类型
 */
export async function ensureTaskTypeDir(inputFilePath: string, type: TaskResultType): Promise<string> {
  const typeDir = getTaskTypeDir(inputFilePath, type);
  await fs.mkdir(typeDir, { recursive: true });
  return typeDir;
}

/**
 * 扫描输入文件同级目录下的所有任务结果文件
 * @param inputFilePath 输入文件路径
 */
export async function scanTaskResults(inputFilePath: string): Promise<TaskResults> {
  const results: TaskResults = {
    transcode: [],
    transcribe: [],
    keyframes: [],
    other: []
  };

  try {
    const inputDir = getInputFileDir(inputFilePath);
    if (!fscb.existsSync(inputDir)) {
      return results;
    }

    // 扫描类型目录
    const taskTypes: TaskResultType[] = ['transcode', 'transcribe', 'keyframes'];
    for (const taskType of taskTypes) {
      const typeDir = path.join(inputDir, taskType);
      if (fscb.existsSync(typeDir) && fscb.statSync(typeDir).isDirectory()) {
        const entries = await fs.readdir(typeDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const fullPath = path.join(typeDir, entry.name);
            const stat = await fs.stat(fullPath);

            const file: TaskResultFile = {
              path: fullPath,
              name: entry.name,
              type: taskType,
              size: stat.size,
              createdAt: stat.birthtimeMs,
              modifiedAt: stat.mtimeMs
            };

            results[taskType].push(file);
          }
        }
      }
    }

    // 排序：按修改时间倒序
    const sortByModified = (a: TaskResultFile, b: TaskResultFile) => b.modifiedAt - a.modifiedAt;
    results.transcode.sort(sortByModified);
    results.transcribe.sort(sortByModified);
    results.keyframes.sort(sortByModified);
    results.other.sort(sortByModified);
  } catch (error) {
    console.warn(`[workflow:task-results] 扫描任务结果失败: ${inputFilePath}`, error);
  }

  return results;
}

/**
 * 获取任务的输出文件路径
 * @param inputFilePath 输入文件路径
 * @param taskType 任务类型
 * @param fileName 文件名
 */
export async function getTaskOutputPath(inputFilePath: string, taskType: TaskResultType, fileName: string): Promise<string> {
  const typeDir = await ensureTaskTypeDir(inputFilePath, taskType);
  return path.join(typeDir, fileName);
}
