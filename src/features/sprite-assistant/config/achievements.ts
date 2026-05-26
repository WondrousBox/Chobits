import { FEATURE_INTRO_QUEST_CATALOG } from '@packages/sprite-core/feature-intro-catalog';

export interface AchievementPresentation {
  id: string;
  title: string;
  description: string;
  category?: string;
}

const ONBOARDING_ACHIEVEMENTS: AchievementPresentation[] = [
  {
    id: 'first-workspace',
    title: '第一座工作空间',
    description: '创建了第一个工作空间，Chobits 的长期记忆有了落点。',
    category: '新手任务'
  },
  {
    id: 'first-import',
    title: '第一次托付文件',
    description: '把第一个文件交给桌面助手，完成拖拽导入。',
    category: '新手任务'
  },
  {
    id: 'first-resource-library-open',
    title: '资源库初见',
    description: '从助手菜单打开资源库，开始管理你的素材和知识。',
    category: '新手任务'
  }
];

const FEATURE_INTRO_ACHIEVEMENTS: AchievementPresentation[] = FEATURE_INTRO_QUEST_CATALOG.map((item) => ({
  id: item.achievementId,
  title: item.title.replace(/^认识/, '了解'),
  description: item.description,
  category: item.area
}));

const ACHIEVEMENT_MAP = new Map<string, AchievementPresentation>(
  [...ONBOARDING_ACHIEVEMENTS, ...FEATURE_INTRO_ACHIEVEMENTS].map((achievement) => [achievement.id, achievement])
);

function titleCaseFromId(id: string): string {
  return id
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function getAchievementPresentation(achievementId: string): AchievementPresentation {
  const normalizedId = achievementId.trim();
  return (
    ACHIEVEMENT_MAP.get(normalizedId) ?? {
      id: normalizedId,
      title: titleCaseFromId(normalizedId) || '隐藏成就',
      description: '完成了一个新的目标。',
      category: '成就'
    }
  );
}
