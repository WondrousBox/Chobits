/* eslint-disable @typescript-eslint/explicit-function-return-type */
import path from 'path';
import sherpa_onnx from 'sherpa-onnx-node';

import MemoRecorderClient from './recorder-client';
import { recorderServer } from './recorder-server';

const modelPath = '';
function createOnlineRecognizer() {
  const config = {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80
    },
    modelConfig: {
      transducer: {
        encoder: path.join(modelPath, 'encoder-epoch-99-avg-1.onnx'),
        decoder: path.join(modelPath, 'decoder-epoch-99-avg-1.onnx'),
        joiner: path.join(modelPath, 'joiner-epoch-99-avg-1.onnx')
      },
      tokens: path.join(modelPath, 'tokens.txt'),
      numThreads: 2,
      provider: 'cpu',
      debug: 1
    },
    decodingMethod: 'greedy_search',
    maxActivePaths: 4,
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20
  };

  return new sherpa_onnx.OnlineRecognizer(config);
}

const recognizer = createOnlineRecognizer();
const stream = recognizer.createStream();

let lastText = '';
let segmentIndex = 0;

const display = new sherpa_onnx.Display(50);

const PORT = 8765;

// 启动录音服务器并开始录音
async function startRecording() {
  try {
    // 启动 WebSocket 服务器
    console.log('正在启动录音服务器...');
    await recorderServer.start(PORT);
    console.log('录音服务器已启动');

    // 创建录音客户端
    const recorderClient = new MemoRecorderClient({
      port: PORT,
      onData: (data: Buffer) => {
        // recorder-client 将 Float32Array 转换为 Int16Array，这里需要转换回 Float32Array
        // 将 Int16Array Buffer 转换回 Float32Array
        const int16Array = new Int16Array(data.buffer, data.byteOffset, data.length / 2);
        const samples = new Float32Array(int16Array.length);

        // 将 Int16 转换回 Float32 (范围 -1.0 到 1.0)
        for (let i = 0; i < int16Array.length; i++) {
          samples[i] = int16Array[i] / 32767.0;
        }

        stream.acceptWaveform({ sampleRate: recognizer.config.featConfig.sampleRate, samples: samples });

        while (recognizer.isReady(stream)) {
          recognizer.decode(stream);
        }

        const isEndpoint = recognizer.isEndpoint(stream);
        const text = recognizer.getResult(stream).text.toLowerCase();

        if (text.length > 0 && lastText != text) {
          lastText = text;
          display.print(segmentIndex, lastText);
        }
        if (isEndpoint) {
          if (text.length > 0) {
            lastText = text;
            segmentIndex += 1;
          }
          recognizer.reset(stream);
        }
      }
    });

    // 开始录音
    await recorderClient.startRecording();
    console.log('Started! Please speak');

    // 处理退出信号
    process.on('SIGINT', async () => {
      console.log('\n正在停止录音...');
      await recorderClient.stopRecording();
      await recorderServer.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n正在停止录音...');
      await recorderClient.stopRecording();
      await recorderServer.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('启动录音失败:', error);
    await recorderServer.stop();
    process.exit(1);
  }
}

// 启动录音
startRecording();
