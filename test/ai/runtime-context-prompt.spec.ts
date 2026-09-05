import { describe, expect, it } from 'vitest';

import { buildRuntimeContextPrompt } from '../../packages/ai/runtime-context-prompt';

describe('buildRuntimeContextPrompt', () => {
  it('injects the current date/time with weekday', () => {
    // 2026-09-05 is a Saturday
    const prompt = buildRuntimeContextPrompt(new Date(2026, 8, 5, 14, 30, 25));

    expect(prompt).toContain('## 当前环境');
    expect(prompt).toContain('2026-09-05 14:30:25');
    expect(prompt).toContain('星期六');
  });

  it('includes the system timezone', () => {
    const prompt = buildRuntimeContextPrompt(new Date(2026, 8, 5));

    expect(prompt).toContain('- 时区：');
  });

  it('pads single-digit date/time parts', () => {
    const prompt = buildRuntimeContextPrompt(new Date(2026, 0, 3, 7, 5, 9));

    expect(prompt).toContain('2026-01-03 07:05:09');
  });
});
