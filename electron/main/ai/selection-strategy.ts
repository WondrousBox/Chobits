import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type SelectionStrategy = {
  // 按顺序的偏好 Provider 列表（越靠前加分越多）
  preferredProviders?: string[];
  // 认为“免费/本地”的 Provider 列表（默认包含 ollama）
  freeProviders?: string[];
  // 针对特定 Provider/Model 的权重微调
  providerWeights?: Record<string, number>;
  modelWeights?: Record<string, number>;
  // 额外加权项
  boosts?: {
    preferredStep?: number; // 每个优先级阶梯的加分（默认 12）
    free?: number; // freeProviders 加分（默认 20）
    hasAllSecrets?: number; // 若已在基础权重中体现，可设置为 0（默认 0）
    recentBase?: number; // 最近使用的基础加分（默认 18）
    recentHalfLifeHours?: number; // 衰减半衰期（默认 24 小时）
  };
  // 控制行为的开关
  flags?: {
    freeOnly?: boolean; // 若为 true，仅从 freeProviders 中选择
  };
};

export type CandForScore = {
  providerId: string;
  model?: string;
  updatedAt: number;
  hasAllRequired: boolean;
};

const DEFAULT_STRATEGY: SelectionStrategy = {
  preferredProviders: ['ollama', 'openai', 'deepseek', 'qwen'],
  freeProviders: ['ollama'],
  providerWeights: {},
  modelWeights: {},
  boosts: { preferredStep: 12, free: 20, hasAllSecrets: 0, recentBase: 18, recentHalfLifeHours: 24 },
  flags: { freeOnly: false }
};

const FILE = path.join(app.getPath('userData'), 'ai-selection-strategy.json');

export function loadSelectionStrategy(): SelectionStrategy {
  try {
    if (!fs.existsSync(FILE)) {
      ensureDefaultStrategyFile();
      return DEFAULT_STRATEGY;
    }
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw) as SelectionStrategy | undefined;
    return mergeStrategy(DEFAULT_STRATEGY, parsed || {});
  } catch {
    // 回退到内置默认
    return DEFAULT_STRATEGY;
  }
}

export function isFreeProvider(providerId: string, strategy: SelectionStrategy): boolean {
  const list = strategy.freeProviders || DEFAULT_STRATEGY.freeProviders || [];
  return list.includes(providerId);
}

export function scoreCandidate(c: CandForScore, strategy: SelectionStrategy): number {
  let score = 0;
  const boosts = strategy.boosts || {};

  // Provider/Model 权重
  const pw = (strategy.providerWeights || {})[c.providerId] || 0;
  const mw = (c.model && (strategy.modelWeights || {})[c.model]) || 0;
  score += Number(pw) + Number(mw);

  // 偏好顺序：越靠前加分越多
  const preferred = strategy.preferredProviders || [];
  const idx = preferred.indexOf(c.providerId);
  if (idx >= 0) {
    const step = boosts.preferredStep ?? 12;
    score += Math.max(0, (preferred.length - idx) * step);
  }

  // 免费/本地加分
  if (isFreeProvider(c.providerId, strategy)) {
    score += boosts.free ?? 20;
  }

  // 是否齐全秘钥（可选）
  if (c.hasAllRequired) {
    score += boosts.hasAllSecrets ?? 0;
  }

  // 最近使用的指数衰减加分
  const half = Math.max(1, Number(boosts.recentHalfLifeHours ?? 24));
  const base = Number(boosts.recentBase ?? 18);
  if (c.updatedAt > 0) {
    const ageMs = Date.now() - c.updatedAt;
    const ageHours = ageMs / (3600 * 1000);
    // 指数衰减：base * 0.5^(age/half)
    const recent = base * Math.pow(0.5, ageHours / half);
    score += recent;
  }

  return score;
}

function mergeStrategy(def: SelectionStrategy, user: SelectionStrategy): SelectionStrategy {
  return {
    preferredProviders: user.preferredProviders ?? def.preferredProviders,
    freeProviders: user.freeProviders ?? def.freeProviders,
    providerWeights: { ...(def.providerWeights || {}), ...(user.providerWeights || {}) },
    modelWeights: { ...(def.modelWeights || {}), ...(user.modelWeights || {}) },
    boosts: { ...(def.boosts || {}), ...(user.boosts || {}) },
    flags: { ...(def.flags || {}), ...(user.flags || {}) }
  };
}

function ensureDefaultStrategyFile(): void {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(DEFAULT_STRATEGY, null, 2), 'utf8');
  } catch {
    // noop
  }
}
