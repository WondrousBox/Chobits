import { OpenAICompatibleProvider } from './openai-compatible';
import type { OpenAIRuntimeSecrets } from './openai-runtime';

export class VllmProvider extends OpenAICompatibleProvider {
  constructor() {
    super('vllm');
    // 内置默认服务器（Chi 门面 serve.py）的 API Key，用户未配置时回落到该值
    const defaultApiKey = this.definition.defaults.config?.apiKey;
    if (defaultApiKey) this.setSecrets({ apiKey: defaultApiKey });
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
}
