import { OpenAICompatibleProvider } from './openai-compatible';

export class ZhipuProvider extends OpenAICompatibleProvider {
  constructor() {
    // 智谱 GLM OpenAI 兼容网关地址可能不同，请在设置中填写
    super({ id: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/', label: '智谱 (GLM)', model: 'glm-4-flash' });
  }

  async transcribe(file: File | Blob | Buffer, options?: { model?: string; language?: string; prompt?: string }): Promise<{ text: string }> {
    const secrets = await this.getSecrets();
    if (!secrets.apiKey) {
      throw new Error('Zhipu API key not configured');
    }

    const formData = new FormData();

    // Handle different input types
    if (Buffer.isBuffer(file)) {
      const blob = new Blob([file as unknown as BlobPart], { type: 'audio/wav' });
      formData.append('file', blob, 'audio.wav');
    } else {
      formData.append('file', file);
    }

    formData.append('model', options?.model || 'glm-asr-2512');

    // Zhipu ASR specific parameters can be added here if needed
    // Note: Zhipu documentation mentions 'stream' parameter, but we are implementing non-stream for now as requested.

    try {
      const baseUrl = secrets.baseUrl || 'https://open.bigmodel.cn/api/paas/v4/';
      const response = await fetch(`${baseUrl}audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secrets.apiKey}`
          // Content-Type is automatically set by fetch when using FormData
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
