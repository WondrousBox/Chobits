import type { SkillInfo } from '@packages/ai/types';
import type { TFunction } from 'i18next';

type SkillTrustPresentation = {
  badgeClassName: string;
  badgeLabel: string;
  note?: string;
};

/**
 * 生成 skill 信任等级的徽标展示。传入 t 时按界面语言输出（chat:components.skillPicker.trust.*），
 * 否则回退内置中文（供测试与非渲染场景使用）。
 */
export function getSkillTrustPresentation(skill: Pick<SkillInfo, 'trustLevel'>, t?: TFunction): SkillTrustPresentation | undefined {
  const trustLevel = skill.trustLevel;
  const badgeLabel = (fallback: string): string => (t ? t(`components.skillPicker.trust.${trustLevel}.label`, { defaultValue: fallback }) : fallback);
  const note = (fallback: string): string => (t ? t(`components.skillPicker.trust.${trustLevel}.note`, { defaultValue: fallback }) : fallback);
  switch (trustLevel) {
    case 'trusted':
      return {
        badgeClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        badgeLabel: badgeLabel('受信任'),
        note: note('来自内置或用户本地 skill 目录。')
      };
    case 'workspace':
      return {
        badgeClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
        badgeLabel: badgeLabel('工作区'),
        note: note('来自当前仓库或工作区，应结合当前项目上下文使用。')
      };
    case 'plugin':
      return {
        badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        badgeLabel: badgeLabel('插件'),
        note: note('来自插件扩展，执行前应确认插件来源与预期动作。')
      };
    case 'compatibility':
      return {
        badgeClassName: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
        badgeLabel: badgeLabel('兼容层'),
        note: note('来自旧 toolbox 兼容桥接，主要用于迁移过渡。')
      };
    default:
      return undefined;
  }
}
