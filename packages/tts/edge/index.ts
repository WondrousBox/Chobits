import { silenceAudio, stripEmoji } from '../common';
import { BaseTTS, TTSOptions } from '../types';
import { ra } from './edge/edge-api';

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
    const result = await ra(this.getSSML({ ...options, text: sanitizedText }), options.fetchOptions?.agent);
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

// -- Test Code --
// 有特殊符号，合成失败会返回空白音频
// (async function main() {
//   const service = new TTS();
//   const result = await service.textToSpeech({
//     text: '〜♪',
//     // rate: 0,
//     pitch: 0,
//     rate: 20,
//     voiceName: 'ja-JP-NanamiNeural'
//     // voiceName: "zh-CN-XiaoxiaoNeural",
//   });
//   console.log(result);
// })();

// 测试多并发请求
// (async function main() {
//   const service = new TTS();
//   const result = service.textToSpeech({
//     text: '学习 & 考试 <测试> "引号" \'单引号\'',
//     rate: 0,
//     pitch: 0,
//     voiceName: 'zh-CN-XiaoxiaoNeural'
//     // fetchOptions: {
//     //   agent: new HttpsProxyAgent(`http://127.0.0.1:7890`)
//     // }
//   });
//   const result2 = service.textToSpeech({
//     text: '学习 & 考试 <测试> "引号" \'单引号\'',
//     rate: 0,
//     pitch: 0,
//     voiceName: 'zh-CN-XiaoxiaoNeural'
//   });

//   Promise.all([result, result2]).then((results) => {
//     console.log(results);
//   });
// })();
