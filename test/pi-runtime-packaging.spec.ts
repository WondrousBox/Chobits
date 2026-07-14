import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const PI_PACKAGE_NAMES = ['@earendil-works/pi-agent-core', '@earendil-works/pi-ai', '@earendil-works/pi-coding-agent', '@earendil-works/pi-tui'];

describe('Pi runtime packaging', () => {
  it('declares every runtime package as a production dependency', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    for (const packageName of PI_PACKAGE_NAMES) {
      expect(packageJson.dependencies?.[packageName], packageName).toBeTruthy();
      expect(packageJson.devDependencies?.[packageName], packageName).toBeUndefined();
    }
  });
});
