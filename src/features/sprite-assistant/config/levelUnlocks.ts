/**
 * 等级解锁配置
 *
 * 定义各等级解锁的内容：
 * - animation: 新动画
 * - behavior: 新行为
 * - skill: 技能树技能
 * - feature: 功能特性
 */

import { getSpriteCapabilityLevelUnlocks } from '@packages/sprite-core/capability-registry';

export type UnlockType = 'animation' | 'behavior' | 'skill' | 'feature';

export interface LevelUnlock {
  /** 解锁等级 */
  level: number;
  /** 解锁类型 */
  type: UnlockType;
  /** 内容 ID（用于关联具体内容） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 图标（emoji 或 icon 名称） */
  icon?: string;
}

const staticLevelUnlocks: LevelUnlock[] = [
  // Lv.3 - 庆祝动画
  {
    level: 3,
    type: 'animation',
    id: 'celebrate',
    name: '庆祝动画',
    description: '精灵学会了庆祝动作',
    icon: '🎉'
  },
  // Lv.7 - 主动问候行为
  {
    level: 7,
    type: 'behavior',
    id: 'greeting',
    name: '主动问候',
    description: '精灵会主动向你打招呼',
    icon: '👋'
  },
  // Lv.12 - 舞蹈动画
  {
    level: 12,
    type: 'animation',
    id: 'dance',
    name: '舞蹈动画',
    description: '精灵学会了跳舞',
    icon: '💃'
  },
  // Lv.25 - 隐藏彩蛋
  {
    level: 25,
    type: 'behavior',
    id: 'easterEgg',
    name: '隐藏彩蛋',
    description: '精灵偶尔会触发神秘彩蛋',
    icon: '🥚'
  },
  // Lv.30 - 专属动作
  {
    level: 30,
    type: 'animation',
    id: 'specialMove',
    name: '专属动作',
    description: '解锁精灵专属动作',
    icon: '⭐'
  },
  // Lv.50 - 大师形态
  {
    level: 50,
    type: 'feature',
    id: 'masterForm',
    name: '大师形态',
    description: '精灵达到大师级，解锁特殊光环',
    icon: '👑'
  }
];

const capabilityLevelUnlocks: LevelUnlock[] = getSpriteCapabilityLevelUnlocks().map((unlock) => ({
  level: unlock.level,
  type: unlock.type,
  id: unlock.id,
  name: unlock.name,
  description: unlock.description,
  icon: unlock.icon
}));

/**
 * 等级解锁内容列表
 */
export const levelUnlocks: LevelUnlock[] = [...staticLevelUnlocks, ...capabilityLevelUnlocks].sort((left, right) => {
  if (left.level !== right.level) return left.level - right.level;
  return left.id.localeCompare(right.id);
});

/**
 * 获取指定等级解锁的内容
 */
export function getUnlocksAtLevel(level: number): LevelUnlock[] {
  return levelUnlocks.filter((unlock) => unlock.level === level);
}

/**
 * 获取所有已解锁的内容
 */
export function getUnlockedContent(currentLevel: number): LevelUnlock[] {
  return levelUnlocks.filter((unlock) => unlock.level <= currentLevel);
}

/**
 * 获取下一个解锁内容
 */
export function getNextUnlock(currentLevel: number): LevelUnlock | null {
  return levelUnlocks.find((unlock) => unlock.level > currentLevel) ?? null;
}
