// YouTube Cookie API
// 用于管理 YouTube 登录和 Cookie

export interface CookieStatus {
  isLoggedIn: boolean;
  cookieCount: number;
  isValid: boolean;
}

/**
 * 打开 YouTube 登录窗口
 * 用户登录后会自动保存 cookies
 */
export async function openYoutubeLogin(): Promise<{ cookieCount: number; isLoggedIn: boolean }> {
  const result = await window.ipcRenderer.invoke('video-downloader:open-youtube-login');
  if (!result.success) {
    throw new Error(result.error || 'Failed to open login window');
  }
  return result.data;
}

/**
 * 获取当前 Cookie 状态
 */
export async function getCookieStatus(): Promise<CookieStatus> {
  const result = await window.ipcRenderer.invoke('video-downloader:get-cookie-status');
  if (!result.success) {
    throw new Error(result.error || 'Failed to get cookie status');
  }
  return result.data;
}

/**
 * 清除所有 YouTube Cookies
 */
export async function clearYoutubeCookies(): Promise<void> {
  const result = await window.ipcRenderer.invoke('video-downloader:clear-cookies');
  if (!result.success) {
    throw new Error(result.error || 'Failed to clear cookies');
  }
}

/**
 * 导出 Cookies 到文件（调试用）
 */
export async function exportCookies(outputPath?: string): Promise<string> {
  const result = await window.ipcRenderer.invoke('video-downloader:export-cookies', outputPath);
  if (!result.success) {
    throw new Error(result.error || 'Failed to export cookies');
  }
  return result.data.filePath;
}
