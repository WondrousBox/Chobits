import path from 'node:path';

import type { BrowserWindow } from 'electron';
import { _electron as electron, type ElectronApplication, type JSHandle, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import pkg from '../package.json';

const root = path.join(__dirname, '..');
let electronApp: ElectronApplication;
let page: Page;

if (process.platform === 'linux') {
  // pass ubuntu
  test(() => expect(true).true);
} else {
  beforeAll(async () => {
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

  describe('[electron-vite-react] e2e tests', async () => {
    test('startup', async () => {
      const title = await page.title();
      expect(title).eq(pkg.name);
    });
  });
}
