import { describe, expect, it } from 'vitest';

import { getSkillTrustPresentation } from '../../src/lib/skill-trust';

describe('chat skill trust presentation', () => {
  it('returns plugin presentation with a cautionary note', () => {
    expect(getSkillTrustPresentation({ trustLevel: 'plugin' })).toEqual({
      badgeClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      badgeLabel: '插件',
      note: '来自插件扩展，执行前应确认插件来源与预期动作。'
    });
  });

  it('returns workspace presentation for project-local skills', () => {
    expect(getSkillTrustPresentation({ trustLevel: 'workspace' })).toEqual({
      badgeClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      badgeLabel: '工作区',
      note: '来自当前仓库或工作区，应结合当前项目上下文使用。'
    });
  });

  it('returns undefined when no trust level is available', () => {
    expect(getSkillTrustPresentation({ trustLevel: undefined })).toBeUndefined();
  });
});
