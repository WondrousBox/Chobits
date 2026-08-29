/**
 * 精灵说话前的文本翻译器
 *
 * 显示文本与朗读文本分离：当朗读语言（如日语 TTS 声线）与显示文本语言
 * 不一致时，把原文发给自部署的翻译网关，拿到译文后再送 TTS。
 *
 * 翻译的 system prompt 与译名表（ちぃ↔小叽、ひでき↔秀树等）全部收敛在
 * 服务端网关内部，客户端只做透传。网关与 vLLM 共用 Bearer key，取自
 * vllm provider 预设（如 vllm-chi-cloud）的 secrets；网关为自签名 HTTPS，
 * TLS 校验沿用该预设的 allowInsecureTls 配置（packages/ai/providers/tls.ts）。
 *
 * 预设不可用或网关报错时抛错，由 SpeakService 降级为原文合成。
 */

import { getPresetSecrets, resolveUsablePreset } from '../../../../packages/ai/preset-service';
import { listProviderSecretKeys } from '../../../../packages/ai/providers/service';
import { resolveFetch } from '../../../../packages/ai/providers/tls';
import { getAllSecrets, getFirstApiKey } from '../../../../packages/ai/settings-store';
import type { SpriteSpeechTextTranslator } from '../../../../packages/sprite-core/speak/types';

// 自部署的中日互译网关（vLLM 前置代理），随部署调整
const TRANSLATE_GATEWAY_BASE_URL = 'https://124.221.9.24:8080';

const TRANSLATE_TIMEOUT_MS = 60_000;

/** 翻译只认 vllm provider 预设（读 Bearer key 与 TLS 配置用） */
const TRANSLATE_PROVIDER_ID = 'vllm';

function resolveDirection(sourceLang: 'zh' | 'ja', targetLang: 'zh' | 'ja'): 'zh2ja' | 'ja2zh' {
  if (sourceLang === 'zh' && targetLang === 'ja') return 'zh2ja';
  if (sourceLang === 'ja' && targetLang === 'zh') return 'ja2zh';
  throw new Error(`Unsupported speech translation direction: ${sourceLang} -> ${targetLang}`);
}

async function readGatewayErrorMessage(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text) as Record<string, any>;
        const message = parsed?.message ?? parsed?.error ?? parsed?.detail;
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
      const direction = resolveDirection(sourceLang, targetLang);

      const preset = await resolveUsablePreset(TRANSLATE_PROVIDER_ID);
      if (!preset) {
        throw new Error('No usable vllm provider preset for speech translation');
      }

      const secretKeys = listProviderSecretKeys(TRANSLATE_PROVIDER_ID);
      const providerSecrets = await getAllSecrets(TRANSLATE_PROVIDER_ID, secretKeys).catch(() => ({}));
      const presetSecrets = await getPresetSecrets(preset.id, secretKeys).catch(() => ({}));
      const secrets = { ...providerSecrets, ...presetSecrets };
      const apiKey = getFirstApiKey(secrets.apiKey);
      if (!apiKey) {
        throw new Error('vllm provider preset has no API key for speech translation');
      }

      // 网关是自签名 HTTPS：预设里开启 allowInsecureTls 时走 tls.ts 的宽松 fetch
      const fetchImpl = (await resolveFetch(secrets)) ?? fetch;
      const response = await fetchImpl(`${TRANSLATE_GATEWAY_BASE_URL}/translate`, {
        body: JSON.stringify({ direction, text }),
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

      const payload = (await response.json().catch(() => undefined)) as { translation?: unknown } | undefined;
      const translation = typeof payload?.translation === 'string' ? payload.translation.trim() : '';
      if (!translation) {
        throw new Error('Speech translation gateway returned empty translation');
      }

      translator.lastBackend = { model: 'server-side', providerId: 'chi-llm-gateway' };
      return translation;
    }
  };

  return translator;
}
