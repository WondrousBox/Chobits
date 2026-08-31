import { getHttpProxy, setSystemProxy } from '@packages/common/net/proxy-agent';
import { BrowserWindow } from 'electron';
import fetch from 'node-fetch';

export { getHttpProxy, isIPv4OrUrl, setSystemProxy } from '@packages/common/net/proxy-agent';

/**
 * 自动获取系统代理设置
 * @param win BrowserWindow 实例
 * @returns Promise<{host: string, port: string} | null> 返回代理信息，如果没有则返回 null
 */
export async function getSystemProxy(win: BrowserWindow): Promise<{ host: string; port: string } | null> {
  console.log('[Proxy] auto get system proxy');
  try {
    const session = win.webContents.session;
    const proxyUrl = await session.resolveProxy('https://www.google.com');

    // DIRECT 表示没有配置代理
    if (proxyUrl === 'DIRECT') {
      console.log('[Proxy] no system proxy configured');
      return null;
    }

    // proxyUrl 格式可能是: 'PROXY 127.0.0.1:6152' 或 'SOCKS5 127.0.0.1:1080'
    const parts = proxyUrl.split(' ');
    if (parts.length >= 2) {
      const hostAndPort = parts[1];
      const [proxyHost, proxyPort] = hostAndPort.split(':');
      console.log('[Proxy] system proxy found', { host: proxyHost, port: proxyPort });
      setSystemProxy(proxyHost, proxyPort);
      return { host: proxyHost, port: proxyPort };
    }

    console.warn('[Proxy] invalid proxy format', { proxyUrl });
    return null;
  } catch (error) {
    console.error('[Proxy] failed to get system proxy', error);
    return null;
  }
}

/**
 * 测试代理连接
 * @param testUrl 测试URL
 * @param timeoutMs 超时时间（毫秒）
 * @returns Promise<number> 返回延迟（毫秒）
 */
export function testProxy(testUrl: string = 'https://www.google.com', timeoutMs: number = 10000): Promise<number> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const agent = getHttpProxy();
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    console.log('[Proxy] testing proxy connection', { testUrl, hasAgent: !!agent });

    fetch(testUrl, { agent, signal: controller.signal })
      .then((response) => {
        clearTimeout(timeoutId);
        const endTime = Date.now();
        const latency = endTime - startTime;
        console.log('[Proxy] test successful', { latency, status: response.status });
        resolve(latency);
      })
      .catch((err: any) => {
        clearTimeout(timeoutId);
        const endTime = Date.now();
        const latency = endTime - startTime;
        if (timedOut) {
          console.warn('[Proxy] test timeout', { latency, timeoutMs });
          reject(new Error('[Proxy] test timeout'));
          return;
        }
        console.error('[Proxy] test failed', { error: err.message, latency });
        reject(new Error(`[Proxy] test failed: ${err.message}`));
      });
  });
}
