import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = {
  appPath: '',
  handler: undefined as ((request: Request) => Promise<Response>) | undefined,
  isPackaged: false
};

vi.mock('electron', () => ({
  app: {
    getAppPath: () => electronState.appPath,
    get isPackaged() {
      return electronState.isPackaged;
    },
    isReady: () => true,
    once: vi.fn()
  },
  protocol: {
    handle: vi.fn(async (_scheme: string, handler: (request: Request) => Promise<Response>) => {
      electronState.handler = handler;
    }),
    registerSchemesAsPrivileged: vi.fn()
  }
}));

describe('resource protocol bundled assets', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.resetModules();
    electronState.handler = undefined;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chobits-resource-protocol-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it.each([
    {
      label: 'development',
      isPackaged: false,
      getAppPath: (root: string) => root,
      getResourceRoot: (root: string) => path.join(root, 'resources')
    },
    {
      label: 'packaged',
      isPackaged: true,
      getAppPath: (root: string) => path.join(root, 'Resources', 'app.asar'),
      getResourceRoot: (root: string) => path.join(root, 'Resources')
    }
  ])('serves provider icons from the $label resource root', async ({ getAppPath, getResourceRoot, isPackaged }) => {
    electronState.appPath = getAppPath(tempDir);
    electronState.isPackaged = isPackaged;

    const iconRelativePath = 'providers/icons/test-provider.svg';
    const iconPath = path.join(getResourceRoot(tempDir), iconRelativePath);
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';
    fs.mkdirSync(path.dirname(iconPath), { recursive: true });
    fs.writeFileSync(iconPath, svg, 'utf8');

    const { addAllowedResourceRoot, setupResourceProtocol } = await import('../electron/main/resource-protocol');
    addAllowedResourceRoot(path.join(tempDir, 'unrelated-resources'));
    await setupResourceProtocol();

    const response = await electronState.handler!(new Request(`res://local/${encodeURIComponent(iconRelativePath)}`));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/svg+xml');
    expect(await response.text()).toBe(svg);
  });
});
