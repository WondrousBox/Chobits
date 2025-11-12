import { BrowserWindow } from 'electron';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { ProxyStore } from './proxy-store';

// 系统代理缓存
let memProxy: HttpsProxyAgent<string> | undefined;

export function isIPv4OrUrl(str?: string): 'ip' | 'url' | '' {
  if (!str) {
    return '';
  }
  // FIXME:照理说IP不能大于255.255.255.255
  // 检测是否为IPV4的结构
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(str)) {
    return 'ip';
  }

  // 检测是否以"http"开头的网址
  const urlRegex = /^http(s)?:\/\//;
  if (urlRegex.test(str)) {
    return 'url';
  }

  return '';
}
/**
 * 设置系统代理（从系统设置中获取）
 */
export function setSystemProxy(host: string, port: string): void {
  memProxy = new HttpsProxyAgent(`http://${host}:${port}`);
  console.log('[Proxy] system proxy set', { host, port });
}

/**
 * 获取当前配置的代理 Agent
 * 根据 ProxyStore 中的配置返回相应的代理 Agent
 */
export function getHttpProxy(): HttpsProxyAgent<string> | SocksProxyAgent | undefined {
  const config = ProxyStore.getConfig();

  // 禁用代理
  if (config.type === 'none') {
    return undefined;
  }

  // 系统代理
  if (config.type === 'system') {
    return memProxy;
  }

  // 自定义代理
  if (config.type === 'custom') {
    const activeProxy = ProxyStore.getActiveProxy();
    if (!activeProxy) {
      console.warn('[Proxy] custom proxy type selected but no active proxy found');
      return undefined;
    }

    try {
      const isIPv4 = isIPv4OrUrl(activeProxy.hostname);
      const prefix = isIPv4 === 'ip' ? 'http://' : '';

      if (activeProxy.type === 'http') {
        return new HttpsProxyAgent(`${prefix}${activeProxy.hostname}:${activeProxy.port}`);
      } else {
        // socks5
        return new SocksProxyAgent(`socks5://${activeProxy.hostname}:${activeProxy.port}`);
      }
    } catch (error) {
      console.error('[Proxy] failed to create proxy agent', { error, activeProxy });
      return undefined;
    }
  }

  return undefined;
}

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
 * @param testUrl 测试URL，默认为 https://www.google.com
 * @returns Promise<number> 返回延迟（毫秒）
 */
export function testProxy(testUrl: string = 'https://www.google.com'): Promise<number> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const agent = getHttpProxy();

    console.log('[Proxy] testing proxy connection', { testUrl, hasAgent: !!agent });

    fetch(testUrl, { agent })
      .then((response) => {
        const endTime = Date.now();
        const latency = endTime - startTime;
        console.log('[Proxy] test successful', { latency, status: response.status });
        resolve(latency);
      })
      .catch((err: any) => {
        const endTime = Date.now();
        const latency = endTime - startTime;
        console.error('[Proxy] test failed', { error: err.message, latency });
        reject(new Error(`代理测试失败: ${err.message}`));
      });
  });
}
