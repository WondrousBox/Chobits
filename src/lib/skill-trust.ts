import type { SkillInfo } from '@packages/ai/types';

type SkillTrustPresentation = {
  badgeClassName: string;
  badgeLabel: string;
  note?: string;
};

export function getSkillTrustPresentation(skill: Pick<SkillInfo, 'trustLevel'>): SkillTrustPresentation | undefined {
  switch (skill.trustLevel) {
    case 'trusted':
      return {
        badgeClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        badgeLabel: '受信任',
        note: '来自内置或用户本地 skill 目录。'
      };
    case 'workspace':
      return {
        badgeClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
        badgeLabel: '工作区',
        note: '来自当前仓库或工作区，应结合当前项目上下文使用。'
      };
    case 'plugin':
      return {
        badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        badgeLabel: '插件',
        note: '来自插件扩展，执行前应确认插件来源与预期动作。'
      };
    case 'compatibility':
      return {
        badgeClassName: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
        badgeLabel: '兼容层',
        note: '来自旧 toolbox 兼容桥接，主要用于迁移过渡。'
      };
    default:
      return undefined;
  }
}
