import { afterEach, describe, expect, it, vi } from 'vitest';

import { isInsecureTlsAllowed, resolveFetch } from '../../packages/ai/providers/tls';

// 测试环境 Node 18 无法加载传递依赖 undici@8（且不应真的发 TLS 请求），
// 用假的 undici fetch + Agent 验证「同一个 undici 包的 fetch + Agent」接线
const undiciFetchMock = vi.fn(async () => new Response('ok'));
const fakeAgentInstances: unknown[] = [];
vi.mock('undici', () => ({
  Agent: class FakeAgent {
    constructor(public options: unknown) {
      fakeAgentInstances.push(this);
    }
  },
  fetch: (...args: unknown[]) => undiciFetchMock(...args)
}));

describe('provider TLS helpers', () => {
  afterEach(() => {
    undiciFetchMock.mockClear();
    fakeAgentInstances.length = 0;
  });

  it('treats only explicit true values as allowing insecure TLS', () => {
    expect(isInsecureTlsAllowed({ allowInsecureTls: 'true' })).toBe(true);
    expect(isInsecureTlsAllowed({ allowInsecureTls: ' true ' })).toBe(true);
    expect(isInsecureTlsAllowed({ allowInsecureTls: 'TRUE' })).toBe(true);
    expect(isInsecureTlsAllowed({ allowInsecureTls: true })).toBe(true);

    expect(isInsecureTlsAllowed({ allowInsecureTls: 'false' })).toBe(false);
    expect(isInsecureTlsAllowed({ allowInsecureTls: '' })).toBe(false);
    expect(isInsecureTlsAllowed({ allowInsecureTls: '1' })).toBe(false);
    expect(isInsecureTlsAllowed({ allowInsecureTls: 'yes' })).toBe(false);
    expect(isInsecureTlsAllowed({ allowInsecureTls: false })).toBe(false);
    expect(isInsecureTlsAllowed({})).toBe(false);
    expect(isInsecureTlsAllowed(undefined)).toBe(false);
    expect(isInsecureTlsAllowed(null)).toBe(false);
  });

  it('returns undefined unless insecure TLS is explicitly enabled', async () => {
    const factory = vi.fn(() => vi.fn());

    await expect(resolveFetch({ allowInsecureTls: 'false' }, factory)).resolves.toBeUndefined();
    await expect(resolveFetch({}, factory)).resolves.toBeUndefined();
    await expect(resolveFetch(undefined, factory)).resolves.toBeUndefined();
    expect(factory).not.toHaveBeenCalled();

    const fetchImpl = await resolveFetch({ allowInsecureTls: 'true' }, factory);
    expect(fetchImpl).toBe(factory.mock.results[0].value);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('default factory routes requests through undici fetch with a relaxed Agent dispatcher', async () => {
    // 不传 factory，走默认实现（动态 import 被 vi.mock 拦截）
    const fetchImpl = await resolveFetch({ allowInsecureTls: 'true' });
    expect(fetchImpl).toBeTypeOf('function');
    expect(fakeAgentInstances).toHaveLength(1);
    expect((fakeAgentInstances[0] as any).options).toMatchObject({ connect: { rejectUnauthorized: false } });

    const controller = new AbortController();
    const headers = { Authorization: 'Bearer k' };
    await fetchImpl!('https://tts.example.com/tts', {
      body: 'payload',
      headers,
      method: 'POST',
      signal: controller.signal
    });

    expect(undiciFetchMock).toHaveBeenCalledOnce();
    const [url, init] = undiciFetchMock.mock.calls[0] as [string, Record<string, any>];
    expect(url).toBe('https://tts.example.com/tts');
    // dispatcher 已合入，且原有 init 字段全部保留
    expect(init.dispatcher).toBe(fakeAgentInstances[0]);
    expect(init).toMatchObject({
      body: 'payload',
      headers,
      method: 'POST',
      signal: controller.signal
    });

    // 再次解析复用同一个 Agent（模块级缓存）
    const again = await resolveFetch({ allowInsecureTls: 'true' });
    expect(fakeAgentInstances).toHaveLength(1);
    expect(again).toBeTypeOf('function');
  });
});
