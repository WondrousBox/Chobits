import { describe, expect, it } from 'vitest';

import {
  getLinkedFolderIssueBadge,
  getLinkedFolderState,
  getLinkedFolderStateDescription,
  getLinkedRootIssueBadge,
  getLinkedRootState,
  getLinkedRootStateDescription,
  getReconnectLinkedMissingDirectoryErrorMessage
} from '../../src/pages/ResourcePage/utils/linkedFolderState';

describe('linked folder state helpers', () => {
  it('parses linked root conflict metadata into a conflict badge and description', () => {
    const folder = {
      originType: 'linked' as const,
      relativePath: '',
      metadata: JSON.stringify({
        linkedRootState: {
          issueType: 'conflict',
          conflictCount: 2
        }
      })
    };

    const state = getLinkedRootState(folder);

    expect(state).toMatchObject({
      issueType: 'conflict',
      conflictCount: 2
    });
    expect(getLinkedRootIssueBadge(state)).toMatchObject({ label: 'Conflict' });
    expect(getLinkedRootStateDescription(state)).toContain('2');
  });

  it('parses linked child missing metadata into a missing badge and description', () => {
    const folder = {
      originType: 'linked' as const,
      relativePath: 'albums/live',
      metadata: JSON.stringify({
        linkedFolderState: {
          issueType: 'missing-folder',
          pathStatus: 'missing'
        }
      })
    };

    const state = getLinkedFolderState(folder);

    expect(state).toMatchObject({
      issueType: 'missing-folder',
      pathStatus: 'missing'
    });
    expect(getLinkedFolderIssueBadge(state)).toMatchObject({ label: 'Missing' });
    expect(getLinkedFolderStateDescription(state)).toContain('磁盘上不存在');
  });

  it('maps reconnect validation errors to actionable copy', () => {
    expect(getReconnectLinkedMissingDirectoryErrorMessage('linked-folder-reconnect-target-not-linked')).toContain('已关联根目录');
    expect(getReconnectLinkedMissingDirectoryErrorMessage('linked-folder-reconnect-target-is-root')).toContain('根目录本身');
    expect(getReconnectLinkedMissingDirectoryErrorMessage('linked-folder-path-already-indexed')).toContain('已经在资源树中索引');
  });
});
