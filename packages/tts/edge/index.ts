import { silenceAudio, stripEmoji } from '../common';
import { BaseTTS, TTSOptions } from '../types';
import { readAloud } from './edge-api';

export interface EdgeTTSOptions extends TTSOptions {
  rate: number;
  pitch: number;
  voiceName: string;
}

export default class TTS implements BaseTTS {
  async textToSpeech(options: EdgeTTSOptions): Promise<Buffer | string> {
    const emptyAudio = Buffer.from(silenceAudio, 'base64');
    const sanitizedText = stripEmoji(options.text);
    if (!sanitizedText) {
      return emptyAudio;
    }
    const result = await readAloud(this.getSSML({ ...options, text: sanitizedText }), options.fetchOptions?.agent);
    if (Buffer.isBuffer(result?.data) && result.data.length <= 0) {
      console.log('[TTS] empty audio, return silence audio for text: ', options.text);

      return emptyAudio;
    }

    return result.success ? Buffer.from(result.data) : result.message || '';
  }

  escapeHtml(str: string): string {
    return str.replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return char;
      }
    });
  }

  getSSML(options: EdgeTTSOptions): string {
    const { text, rate = 20, pitch = 0, voiceName = 'zh-CN-XiaoxiaoNeural' } = options;
    // https://github.com/Migushthe2nd/MsEdgeTTS?tab=readme-ov-file
    // https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-structure
    return `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xmlns:emo="http://www.w3.org/2009/10/emotionml" version="1.0" xml:lang="en-US">          
      <voice name="${voiceName}">
        <prosody rate="${rate}%" pitch="${pitch}%">
            ${this.escapeHtml(text)}
        </prosody>
      </voice>
    </speak>`;
  }
}
