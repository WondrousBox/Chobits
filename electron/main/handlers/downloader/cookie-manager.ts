import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow } from 'electron';

import pkg from '../../../../package.json';

const COOKIE_FILE_PATH = path.join(app.getPath('userData'), 'data', 'youtube-cookies.json');

export interface YoutubeCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
}

/**
 * YouTube Cookie 管理器
 * 通过内置登录窗口获取 YouTube cookies
 */
export class CookieManager {
  private cookies: YoutubeCookie[] = [];

  constructor() {
    this.loadCookiesFromFile();
  }

  /**
   * 打开 YouTube 登录窗口
   * 用户登录后自动提取 cookies
   */
  async openLoginWindow(parentWindow?: BrowserWindow): Promise<YoutubeCookie[]> {
    return new Promise((resolve, reject) => {
      // 创建登录窗口
      const loginWindow = new BrowserWindow({
        width: 500,
        height: 700,
        parent: parentWindow,
        modal: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:youtube-login' // 使用独立的 session
        },
        title: 'Login to YouTube',
        autoHideMenuBar: true
      });

      // 登录页面 URL
      const loginUrl = 'https://accounts.google.com/ServiceLogin?continue=https://www.youtube.com';

      loginWindow.loadURL(loginUrl);

      // 监听导航事件
      loginWindow.webContents.on('did-navigate', async (event, url) => {
        console.log('[CookieManager] Navigated to:', url);

        // 如果导航到 YouTube 主页，说明登录成功
        if (url.startsWith('https://www.youtube.com')) {
          try {
            // 提取 cookies
            const extractedCookies = await this.extractCookiesFromSession(loginWindow);

            if (extractedCookies.length > 0) {
              this.cookies = extractedCookies;
              await this.saveCookiesToFile();

              console.log(`[CookieManager] Successfully extracted ${extractedCookies.length} cookies`);

              loginWindow.close();
              resolve(extractedCookies);
            }
          } catch (error) {
            console.error('[CookieManager] Failed to extract cookies:', error);
          }
        }
      });

      // 窗口关闭事件
      loginWindow.on('closed', () => {
        if (this.cookies.length === 0) {
          reject(new Error('Login window closed without completing login'));
        }
      });

      // 错误处理
      loginWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('[CookieManager] Failed to load:', errorCode, errorDescription);
      });
    });
  }

  /**
   * 从 session 中提取 YouTube 相关的 cookies
   */
  private async extractCookiesFromSession(window: BrowserWindow): Promise<YoutubeCookie[]> {
    const sessionCookies = await window.webContents.session.cookies.get({});

    // 过滤出 YouTube 和 Google 相关的 cookies
    const youtubeCookies = sessionCookies
      .filter((cookie) => cookie.domain?.includes('youtube.com') || cookie.domain?.includes('google.com'))
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || '',
        path: cookie.path || '/',
        secure: cookie.secure || false,
        httpOnly: cookie.httpOnly || false,
        expirationDate: cookie.expirationDate
      }))
      .filter((cookie) => cookie.domain !== ''); // 过滤掉无效的 cookies

    return youtubeCookies;
  }

  /**
   * 将 cookies 保存到本地文件
   */
  private async saveCookiesToFile(): Promise<void> {
    try {
      const cookiesData = JSON.stringify(this.cookies, null, 2);
      await fs.promises.writeFile(COOKIE_FILE_PATH, cookiesData, 'utf-8');
      console.log('[CookieManager] Cookies saved to file');
    } catch (error) {
      console.error('[CookieManager] Failed to save cookies:', error);
    }
  }

  /**
   * 从本地文件加载 cookies
   */
  private loadCookiesFromFile(): void {
    try {
      if (fs.existsSync(COOKIE_FILE_PATH)) {
        const cookiesData = fs.readFileSync(COOKIE_FILE_PATH, 'utf-8');
        this.cookies = JSON.parse(cookiesData);
        console.log(`[CookieManager] Loaded ${this.cookies.length} cookies from file`);
      }
    } catch (error) {
      console.error('[CookieManager] Failed to load cookies:', error);
      this.cookies = [];
    }
  }

  /**
   * 获取当前的 cookies
   */
  getCookies(): YoutubeCookie[] {
    return this.cookies;
  }

  /**
   * 检查 cookies 是否有效（未过期）
   */
  isValid(): boolean {
    if (this.cookies.length === 0) {
      return false;
    }

    const now = Date.now() / 1000;

    // 检查关键的 SECURE cookies 是否过期
    const secureCookies = this.cookies.filter((c) => c.name.startsWith('__Secure') || c.name.startsWith('SAPISID') || c.name.startsWith('SSID'));

    if (secureCookies.length === 0) {
      return false;
    }

    return secureCookies.every((cookie) => {
      if (!cookie.expirationDate) {
        return true; // Session cookies
      }
      return cookie.expirationDate > now;
    });
  }

  /**
   * 清除 cookies
   */
  async clearCookies(): Promise<void> {
    this.cookies = [];

    try {
      if (fs.existsSync(COOKIE_FILE_PATH)) {
        await fs.promises.unlink(COOKIE_FILE_PATH);
      }
      console.log('[CookieManager] Cookies cleared');
    } catch (error) {
      console.error('[CookieManager] Failed to clear cookies:', error);
    }
  }

  /**
   * 导出 cookies 为 Netscape 格式（yt-dlp 可用）
   * 这是 yt-dlp 支持的 --cookies 参数格式
   */
  async exportNetscapeCookies(outputPath?: string): Promise<string> {
    const filePath = outputPath || path.join(app.getPath('temp'), 'youtube-cookies.txt');

    let content = '# Netscape HTTP Cookie File\n';
    content += `# This file was generated by ${pkg.name}\n`;
    content += '# Edit at your own risk.\n\n';

    for (const cookie of this.cookies) {
      // Netscape format:
      // domain  flag  path  secure  expiration  name  value
      const domain = cookie.domain.startsWith('.') ? cookie.domain : '.' + cookie.domain;
      const flag = 'TRUE'; // domain flag
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const expiration = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;

      content += `${domain}\t${flag}\t${cookie.path}\t${secure}\t${expiration}\t${cookie.name}\t${cookie.value}\n`;
    }

    await fs.promises.writeFile(filePath, content, 'utf-8');
    console.log('[CookieManager] Exported cookies to:', filePath);

    return filePath;
  }

  /**
   * 获取 cookies 数量
   */
  getCookieCount(): number {
    return this.cookies.length;
  }

  /**
   * 检查是否已登录
   */
  isLoggedIn(): boolean {
    return this.isValid();
  }
}

// 导出单例
export const cookieManager = new CookieManager();
