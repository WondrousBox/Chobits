import { HttpsProxyAgent } from 'https-proxy-agent';
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
