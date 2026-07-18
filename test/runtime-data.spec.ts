import { describe, expect, it } from 'vitest';

import { resolveRuntimeDataDir } from '../electron/main/utils/runtime-data';

describe('resolveRuntimeDataDir', () => {
  it('keeps packaged data at the existing userData root', () => {
    expect(resolveRuntimeDataDir('/tmp/chobits-user-data', true)).toBe('/tmp/chobits-user-data');
  });

  it('isolates dev mutable state below a dedicated directory', () => {
    expect(resolveRuntimeDataDir('/tmp/chobits-user-data', false)).toBe('/tmp/chobits-user-data/dev');
  });
});
