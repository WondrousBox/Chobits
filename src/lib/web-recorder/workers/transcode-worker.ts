/**
 * Transcode Worker
 *
 * This worker handles audio transcoding tasks:
 * - Resampling to 16kHz
 * - Converting to 16-bit PCM format
 */

// Resample audio data to 16kHz using linear interpolation
function to16kHz(audioData: Float32Array, sourceSampleRate: number): Float32Array {
  const data = new Float32Array(audioData);
  const targetSampleRate = 16000;
  const fitCount = Math.round(data.length * (targetSampleRate / sourceSampleRate));
  const newData = new Float32Array(fitCount);
  const springFactor = (data.length - 1) / (fitCount - 1);

  newData[0] = data[0];
  for (let i = 1; i < fitCount - 1; i++) {
    const tmp = i * springFactor;
    const before = Math.floor(tmp);
    const after = Math.ceil(tmp);
    const atPoint = tmp - before;
    newData[i] = data[before] + (data[after] - data[before]) * atPoint;
  }
  newData[fitCount - 1] = data[data.length - 1];

  return newData;
}

// Convert Float32Array to 16-bit PCM (DataView)
function to16BitPCM(input: Float32Array): DataView {
  const dataLength = input.length * (16 / 8);
  const dataBuffer = new ArrayBuffer(dataLength);
  const dataView = new DataView(dataBuffer);
  let offset = 0;

  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return dataView;
}

// Handle messages from main thread
self.onmessage = function (e: MessageEvent<{ audioData: Float32Array; sampleRate?: number }>) {
  const { audioData, sampleRate = 44100 } = e.data;

  // Resample to 16kHz
  const data16kHz = to16kHz(audioData, sampleRate);
  self.postMessage({ type: 'to16kHz', output: data16kHz });

  // Convert to 16-bit PCM
  const pcm16Bit = to16BitPCM(data16kHz);
  const output = new Uint8Array(pcm16Bit.buffer);
  self.postMessage({ type: 'to16BitPCM', output });
};

// Send initialization message
self.postMessage({ type: 'init', output: 'worker initialized' });
