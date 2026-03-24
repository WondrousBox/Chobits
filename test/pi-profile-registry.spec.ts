import { describe, expect, it } from 'vitest';

import { listPiAgentProfiles } from '../packages/ai/runtime/pi/profile-registry';

describe('listPiAgentProfiles', () => {
  it('only exposes the three supported chat modes', () => {
    expect(
      listPiAgentProfiles().map((profile) => ({
        id: profile.id,
        label: profile.label
      }))
    ).toEqual([
      { id: 'chat', label: '普通对话模式' },
      { id: 'assistant', label: 'Agent模式' },
      { id: 'coder', label: '代码模式' }
    ]);
  });
});
