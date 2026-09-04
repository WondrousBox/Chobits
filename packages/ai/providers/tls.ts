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
 * 注意：undici 是直接 dependency（npm 包，版本高于 Node 内置），
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

// ---------------------------------------------------------------------------
// pi 运行时的 TLS 中继
//
// pi 运行时（pi-ai → openai SDK）内部直接 new OpenAI({ baseURL })，不支持注入
// 自定义 fetch/dispatcher，只能走全局 fetch。这里对全局 fetch 做一次按 origin
// 白名单的中继：仅当某 https origin 被显式登记为「允许自签名」时才转到宽松
// undici Agent，其余请求原样透传给原始全局 fetch，不全局关闭 TLS 校验。
// ---------------------------------------------------------------------------

const insecureTlsOrigins = new Set<string>();
let globalRelayInstalled = false;

function installGlobalInsecureFetchRelay(): void {
  if (globalRelayInstalled) return;
  if (typeof globalThis.fetch !== 'function') return;
  globalRelayInstalled = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (url) {
      try {
        if (insecureTlsOrigins.has(new URL(url).origin)) {
          const insecureFetch = await createInsecureFetch();
          return insecureFetch(url, init);
        }
      } catch {
        // URL 解析失败等异常不影响主流程，落回原始 fetch
      }
    }
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
}

/**
 * 把一个 https URL/origin 登记为「允许自签名证书」，供无法注入自定义 fetch 的
 * 调用方（pi 运行时的 openai SDK）使用。非 https 或非法 URL 直接忽略。
 */
export function allowInsecureTlsOrigin(urlOrOrigin?: string): void {
  if (!urlOrOrigin) return;
  let origin: string;
  try {
    origin = new URL(urlOrOrigin).origin;
  } catch {
    return;
  }
  if (!origin.startsWith('https:')) return;
  insecureTlsOrigins.add(origin);
  installGlobalInsecureFetchRelay();
}
