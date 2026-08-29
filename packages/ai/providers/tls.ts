/**
 * Provider TLS 助手
 *
 * 部分自托管服务（私有 vLLM、GPT-SoVITS 等）使用 HTTPS + 自签名证书，
 * Node fetch（undici）默认拒绝。这里提供按 secrets 逐项开启的宽松 TLS：
 * 仅当 `secrets.allowInsecureTls` 为字符串 'true'（或布尔 true）时才生效，
 * 绝不全局关闭 TLS 校验。
 *
 * 关键实现细节：不能单独把 npm 包 undici 的 `Agent` 作为 `dispatcher` 传给
 * Node 内置 undici 的全局 fetch —— 两者版本不同（跨版本 dispatcher 接口
 * 不兼容，实测 Node 22 内置 undici@6.x + npm undici@8.x 会报
 * `invalid onRequestStart method`）。正确做法是动态加载 npm undici 包后，
 * 用**同一个包**的 `fetch` + 配套 `Agent` 发请求。
 *
 * 注意：undici 是高版本传递依赖（shamefully-hoist 提升到根 node_modules），
 * 且只在显式开启时动态加载，避免给默认路径增加开销与兼容性风险。
 */

/** 与全局 fetch 对齐的最小签名（dispatcher 不在标准 RequestInit 里，init 按 any 透传） */
export type InsecureFetch = (url: string | URL, init?: any) => Promise<Response>;

/** 可注入的 fetch 工厂，便于测试（默认实现动态加载 undici 的 fetch + Agent） */
export type InsecureFetchFactory = () => InsecureFetch | Promise<InsecureFetch>;

// 模块级缓存宽松 Agent，避免每次请求新建连接池
let insecureAgent: unknown;

async function createInsecureFetch(): Promise<InsecureFetch> {
  const { Agent, fetch: undiciFetch } = await import('undici');
  insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
  const dispatcher = insecureAgent;

  return (url, init) =>
    undiciFetch(
      url as any,
      {
        ...(init as any),
        dispatcher
      } as any
    ) as unknown as Promise<Response>;
}

/**
 * 判断 secrets 是否显式开启了「允许自签名证书」。
 * 设置页 select 字段存的是字符串 'true' / 'false'，未配置（undefined/''）视为严格校验。
 */
export function isInsecureTlsAllowed(secrets: Record<string, unknown> | undefined | null): boolean {
  const value = secrets?.allowInsecureTls;
  if (value === true) return true;
  return (
    String(value ?? '')
      .trim()
      .toLowerCase() === 'true'
  );
}

/**
 * 按 secrets 解析 fetch 实现：未开启时返回 undefined（调用方继续用全局 fetch，
 * 默认行为完全不变）；开启时返回基于 npm undici fetch + 宽松 Agent 的 fetch 函数。
 */
export async function resolveFetch(secrets: Record<string, unknown> | undefined | null, factory: InsecureFetchFactory = createInsecureFetch): Promise<InsecureFetch | undefined> {
  if (!isInsecureTlsAllowed(secrets)) return undefined;
  return factory();
}
