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
      const response = await fetch('https://open.bigmodel.cn/api/paas/v4/audio/transcriptions', {
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
