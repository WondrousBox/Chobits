export type ProxyType = 'none' | 'system' | 'custom';

export type ProxyAgentType = 'http' | 'socks5';

export interface CustomProxy {
  type: ProxyAgentType;
  hostname: string;
  port: number;
  active: boolean;
}

export interface ProxyConfig {
  type: ProxyType;
  proxies?: CustomProxy[]; // 仅当 type === 'custom' 时使用
}
