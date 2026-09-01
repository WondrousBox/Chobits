import { OpenAICompatibleProvider } from './openai-compatible';
import type { OpenAIRuntimeSecrets } from './openai-runtime';

export class VllmProvider extends OpenAICompatibleProvider {
  // 内置默认服务器（Chi 门面 serve.py）的 API Key，用户未配置时回落到该值
  private readonly defaultApiKey?: string;

  constructor() {
    super('vllm');
    this.defaultApiKey = this.definition.defaults.config?.apiKey;
    if (this.defaultApiKey) this.setSecrets({ apiKey: this.defaultApiKey });
  }

  clearSecrets(): void {
    super.clearSecrets();
    // 清除用户配置后仍需回落到内置默认服务器的 API Key
    if (this.defaultApiKey) this.setSecrets({ apiKey: this.defaultApiKey });
  }

  protected resolveSecrets(override?: Partial<OpenAIRuntimeSecrets>): OpenAIRuntimeSecrets {
    const merged = super.resolveSecrets(override);
    // 默认服务器是 HTTPS + 自签名证书：baseUrl 为 https 且用户未显式配置时，
    // 默认放宽 TLS 校验；显式设置 'false' 仍可回到严格校验
    if (merged.allowInsecureTls === undefined && String(merged.baseUrl || '').startsWith('https:')) {
      merged.allowInsecureTls = 'true';
    }
    return merged;
  }

  getSecrets(): OpenAIRuntimeSecrets {
    // pi 运行时从 adapterSecrets 取 TLS 配置，需要把 https 条件默认值也带出去
    return this.resolveSecrets();
  }
}
