import type { ProviderSecrets, TranscribeOptions } from '../types';
import { getBuiltinProviderMetadata } from './metadata';
import { OpenAICompatibleProvider } from './openai-compatible';

function resolveZhipuAudioTranscriptionUrl(baseUrl?: string): string {
  const normalizedBaseUrl = String(baseUrl || 'https://open.bigmodel.cn/api/paas/v4/')
    .trim()
    .replace(/\/+$/, '');
  return `${normalizedBaseUrl}/audio/transcriptions`;
}

export class ZhipuProvider extends OpenAICompatibleProvider {
  constructor() {
    const metadata = getBuiltinProviderMetadata('zhipu');
    if (!metadata) {
      throw new Error('Missing built-in provider metadata: zhipu');
    }

    super({
      id: metadata.id,
      baseUrl: metadata.providerBaseUrl,
      label: metadata.label,
      model: metadata.defaultModel
    });
  }

  async transcribe(file: File | Blob | Buffer | ArrayBuffer, options?: TranscribeOptions): Promise<{ text: string }> {
    const providerSecrets = (await this.getSecrets()) as ProviderSecrets;
    const secrets = {
      ...providerSecrets,
      ...(options?.secrets || {})
    };

    if (!secrets.apiKey) {
      throw new Error('Zhipu API key not configured');
    }

    const formData = new FormData();

    if (Buffer.isBuffer(file) || file instanceof ArrayBuffer) {
      const fileObj = new File([file as any], 'audio.wav', { type: 'audio/wav' });
      formData.append('file', fileObj);
    } else if (file instanceof Blob) {
      formData.append('file', file, 'audio.wav');
    } else {
      formData.append('file', file);
    }

    formData.append('model', options?.model || 'glm-asr-2512');
    if (options?.prompt) {
      formData.append('prompt', options.prompt);
    }

    try {
      const response = await fetch(resolveZhipuAudioTranscriptionUrl(secrets.baseUrl), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secrets.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Zhipu ASR failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return { text: result.text };
    } catch (error) {
      console.error('Zhipu transcription error:', error);
      throw error;
    }
  }
}
