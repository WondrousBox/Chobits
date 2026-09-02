/**
 * 精灵说话前的文本翻译器
 *
 * 显示文本与朗读文本分离：当朗读语言（如日语 TTS 声线）与显示文本语言
 * 不一致时，把原文发给自部署的翻译服务，拿到译文后再送 TTS。
 *
 * 服务端（serve.py 门面）按 OpenAI 兼容协议的 model 名路由：model 固定
 * chi-translate，翻译方向由服务端自动判断（含假名 → ja2zh，否则 zh2ja）；
 * 翻译的 system prompt 与译名表（ちぃ↔小叽、ひでき↔秀树等）全部收敛在
 * 服务端内部，客户端只做透传。
 *
 * 鉴权与 TLS 配置取自 vllm provider：预设/服务商存储的 secrets 优先，
 * 未配置时回落到 vllm 定义里的内置默认服务器（defaults.config）。
 *
 * 服务不可用或报错时抛错，由 SpeakService 降级为原文合成。
 */

import { getPresetSecrets, resolveUsablePreset } from '../../../../packages/ai/preset-service';
import { getBuiltinProviderDefinitionOrThrow, listProviderSecretKeys } from '../../../../packages/ai/providers/service';
import { resolveFetch } from '../../../../packages/ai/providers/tls';
import { getAllSecrets, getFirstApiKey } from '../../../../packages/ai/settings-store';
import type { SpriteSpeechTextTranslator } from '../../../../packages/sprite-core/speak/types';

// 翻译路由模型：serve.py 门面按 model 名分发到翻译逻辑
const TRANSLATE_MODEL = 'chi-translate';

const TRANSLATE_TIMEOUT_MS = 60_000;

/** 翻译只认 vllm provider 预设（读 Bearer key 与 TLS 配置用） */
const TRANSLATE_PROVIDER_ID = 'vllm';

async function readGatewayErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text) as Record<string, any>;
        // OpenAI 标准错误格式 { error: { message } }，兼容 { message } / { detail }
        const nested = parsed?.error && typeof parsed.error === 'object' ? (parsed.error as Record<string, any>).message : undefined;
        const message = nested ?? parsed?.error ?? parsed?.message ?? parsed?.detail;
        if (typeof message === 'string' && message.trim()) return message.trim();
      } catch {
        // 非 JSON 错误体，原样返回
      }
      return text.trim();
    }
  } catch {
    // fall through
  }
  return response.statusText || 'unknown error';
}

export function createSpriteSpeechTextTranslator(): SpriteSpeechTextTranslator {
  const translator: SpriteSpeechTextTranslator = {
    async translate({ text, sourceLang, targetLang }) {
      if (sourceLang === targetLang) {
        throw new Error(`Unsupported speech translation direction: ${sourceLang} -> ${targetLang}`);
      }

      // 内置默认服务器配置（baseUrl 含 /v1 后缀、apiKey、allowInsecureTls），
      // 存储层（provider 级 / 预设级）的值覆盖默认值
      const defaults = (getBuiltinProviderDefinitionOrThrow(TRANSLATE_PROVIDER_ID).defaults.config || {}) as Record<string, string>;
      const secretKeys = listProviderSecretKeys(TRANSLATE_PROVIDER_ID);
      const preset = await resolveUsablePreset(TRANSLATE_PROVIDER_ID);
      const providerSecrets: Record<string, string> = await getAllSecrets(TRANSLATE_PROVIDER_ID, secretKeys).catch(() => ({}));
      const presetSecrets: Record<string, string> = preset ? await getPresetSecrets(preset.id, secretKeys).catch(() => ({})) : {};
      const secrets = { ...defaults, ...providerSecrets, ...presetSecrets };
      const apiKey = getFirstApiKey(secrets.apiKey);
      if (!apiKey) {
        throw new Error('vllm provider has no API key for speech translation');
      }

      const baseUrl = String(secrets.baseUrl || '')
        .trim()
        .replace(/\/+$/, '');
      if (!baseUrl) {
        throw new Error('vllm provider has no baseUrl for speech translation');
      }

      // 网关是自签名 HTTPS：预设里开启 allowInsecureTls（或走内置默认）时走 tls.ts 的宽松 fetch
      const fetchImpl = (await resolveFetch(secrets)) ?? fetch;
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        body: JSON.stringify({
          messages: [{ content: text, role: 'user' }],
          model: TRANSLATE_MODEL,
          stream: false
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS)
      });

      if (!response.ok) {
        const message = await readGatewayErrorMessage(response);
        throw new Error(`Speech translation gateway failed (${response.status}): ${message}`);
      }

      const payload = (await response.json().catch(() => undefined)) as { choices?: Array<{ message?: { content?: unknown } }> } | undefined;
      const content = payload?.choices?.[0]?.message?.content;
      const translation = typeof content === 'string' ? content.trim() : '';
      if (!translation) {
        throw new Error('Speech translation gateway returned empty translation');
      }

      translator.lastBackend = { model: TRANSLATE_MODEL, providerId: TRANSLATE_PROVIDER_ID };
      return translation;
    }
  };

  return translator;
}
