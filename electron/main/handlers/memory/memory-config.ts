/**
 * Memory System Configuration Store
 *
 * 管理记忆系统的用户偏好设置，包括：
 * - 记忆系统总开关
 * - 自动提取开关
 * - 自动召回开关
 * - 提取使用的 provider/model
 * - 提取触发参数
 */

import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

export interface MemoryConfig {
  /** 记忆系统总开关 */
  memoryEnabled: boolean;
  /** 自动提取开关 */
  autoExtractionEnabled: boolean;
  /** 自动召回开关（对话前自动注入相关记忆） */
  autoRecallEnabled: boolean;
  /** 提取使用的 provider ID（独立于聊天 provider） */
  extractionProviderId?: string;
  /** 提取使用的 model ID */
  extractionModel?: string;
  /** 最小触发消息数（新消息数低于此值不触发提取） */
  minNewMessagesForExtraction: number;
  /** 提取触发最小间隔（分钟） */
  extractionCooldownMinutes: number;
  /** 单次最大 token 预算 */
  maxTokensPerExtraction: number;
}

const DEFAULT_CONFIG: MemoryConfig = {
  memoryEnabled: true,
  autoExtractionEnabled: true,
  autoRecallEnabled: true,
  minNewMessagesForExtraction: 4,
  extractionCooldownMinutes: 5,
  maxTokensPerExtraction: 4000
};

const CONFIG_DIR = path.join(app.getPath('userData'), 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'memory-config.json');

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function getMemoryConfig(): MemoryConfig {
  ensureConfigDir();
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const data = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch {
    // ignore parse errors, return default
  }
  return { ...DEFAULT_CONFIG };
}

export function setMemoryConfig(patch: Partial<MemoryConfig>): MemoryConfig {
  const current = getMemoryConfig();
  const updated = { ...current, ...patch };
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
  return updated;
}
