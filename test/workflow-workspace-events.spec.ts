import { describe, expect, it } from 'vitest';

import { matchesWorkflowWorkspace } from '../src/utils/broadcastChannels';

describe('workflow workspace event filtering', () => {
  it('accepts only events from the active workspace', () => {
    expect(matchesWorkflowWorkspace('workspace-a', 'workspace-a')).toBe(true);
    expect(matchesWorkflowWorkspace('workspace-a', 'workspace-b')).toBe(false);
    expect(matchesWorkflowWorkspace('workspace-a', undefined)).toBe(false);
  });

  it('allows an unscoped consumer to observe all workspaces', () => {
    expect(matchesWorkflowWorkspace(undefined, 'workspace-a')).toBe(true);
  });
});
