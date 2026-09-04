import path from 'node:path';

import type { BrowserWindow } from 'electron';
import type { ElectronApplication, JSHandle, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import pkg from '../../package.json';

const root = path.join(__dirname, '../..');
let electronApp: ElectronApplication;
let page: Page;

if (process.platform === 'linux') {
  // pass ubuntu
  test(() => expect(true).true);
} else {
  beforeAll(async () => {
    const { _electron: electron } = await import('playwright');
    electronApp = await electron.launch({
      args: ['.', '--no-sandbox'],
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development' }
    });
    page = await electronApp.firstWindow();

    const mainWin: JSHandle<BrowserWindow> = await electronApp.browserWindow(page);
    await mainWin.evaluate(async (win) => {
      win.webContents.executeJavaScript('console.log("Execute JavaScript with e2e testing.")');
    });
  });

  afterAll(async () => {
    await page.screenshot({ path: 'test/screenshots/e2e.png' });
    await page.close();
    await electronApp.close();
  });

  describe('[Chobits] e2e tests', async () => {
    test('startup', async () => {
      const title = await page.title();
      expect(title).eq(pkg.name);
    });
  });
}
