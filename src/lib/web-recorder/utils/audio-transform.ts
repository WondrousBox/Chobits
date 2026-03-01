/**
 * Audio Transform Utilities
 *
 * Provides functions for audio data conversion and compression.
 */

/**
 * Resample audio data to 16kHz using linear interpolation
 *
 * @param audioData - Input Float32Array audio data
 * @param sourceSampleRate - Original sample rate
 * @returns Resampled Float32Array at 16kHz
 */
export function to16kHz(audioData: Float32Array, sourceSampleRate: number): Float32Array {
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

/**
 * Convert Float32Array to 16-bit PCM (DataView)
 *
 * @param input - Float32Array audio data in range [-1, 1]
 * @returns DataView containing 16-bit PCM data
 */
export function to16BitPCM(input: Float32Array): DataView {
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

/**
 * Convert Float32Array to Int16Array (16-bit PCM)
 *
 * @param input - Float32Array audio data in range [-1, 1]
 * @returns Int16Array containing 16-bit PCM data
 */
export function toInt16Array(input: Float32Array): Int16Array {
  const result = new Int16Array(input.length);

  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return result;
}

/**
 * Data compression based on sample rate
 * Compresses data by taking every Nth sample where N = inputSampleRate / outputSampleRate
 *
 * @param data - Audio data with left and right channels
 * @param inputSampleRate - Input sample rate
 * @param outputSampleRate - Output sample rate
 * @returns Compressed Float32Array
 */
export function compress(data: { left: Float32Array; right: Float32Array }, inputSampleRate: number, outputSampleRate: number): Float32Array {
  const rate = inputSampleRate / outputSampleRate;
  const compression = Math.max(rate, 1);
  const lData = data.left;
  const rData = data.right;
  const length = Math.floor((lData.length + rData.length) / rate);
  const result = new Float32Array(length);
  let index = 0;
  let j = 0;

  while (index < length) {
    const temp = Math.floor(j);
    result[index] = lData[temp];
    index++;

    if (rData.length > 0) {
      result[index] = rData[temp];
      index++;
    }

    j += compression;
  }

  return result;
}

/**
 * Encode PCM data with specified bit depth
 *
 * @param bytes - Audio data
 * @param sampleBits - Sample bits (8 or 16)
 * @param littleEndian - Whether to use little endian byte order
 * @returns DataView containing encoded PCM data
 */
export function encodePCM(bytes: Float32Array, sampleBits: 8 | 16, littleEndian: boolean = true): DataView {
  const dataLength = bytes.length * (sampleBits / 8);
  const buffer = new ArrayBuffer(dataLength);
  const data = new DataView(buffer);
  let offset = 0;

  if (sampleBits === 8) {
    for (let i = 0; i < bytes.length; i++, offset++) {
      const s = Math.max(-1, Math.min(1, bytes[i]));
      const val = s < 0 ? s * 128 : s * 127;
      data.setInt8(offset, val + 128);
    }
  } else {
    for (let i = 0; i < bytes.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, bytes[i]));
      data.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, littleEndian);
    }
  }

  return data;
}

/**
 * Write string to DataView at specified offset
 */
function writeString(data: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    data.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encode PCM data to WAV format
 *
 * @param bytes - PCM data
 * @param inputSampleRate - Input sample rate
 * @param outputSampleRate - Output sample rate
 * @param numChannels - Number of channels
 * @param outputSampleBits - Output sample bits
 * @param littleEndian - Whether to use little endian byte order
 * @returns DataView containing WAV file data
 */
export function encodeWAV(bytes: DataView, inputSampleRate: number, outputSampleRate: number, numChannels: 1 | 2, outputSampleBits: 8 | 16, littleEndian: boolean = true): DataView {
  const sampleRate = outputSampleRate > inputSampleRate ? inputSampleRate : outputSampleRate;
  const sampleBits = outputSampleBits;
  const buffer = new ArrayBuffer(44 + bytes.byteLength);
  const data = new DataView(buffer);
  let offset = 0;

  // RIFF header
  writeString(data, offset, 'RIFF');
  offset += 4;
  data.setUint32(offset, 36 + bytes.byteLength, littleEndian);
  offset += 4;
  writeString(data, offset, 'WAVE');
  offset += 4;

  // fmt chunk
  writeString(data, offset, 'fmt ');
  offset += 4;
  data.setUint32(offset, 16, littleEndian);
  offset += 4;
  data.setUint16(offset, 1, littleEndian);
  offset += 2;
  data.setUint16(offset, numChannels, littleEndian);
  offset += 2;
  data.setUint32(offset, sampleRate, littleEndian);
  offset += 4;
  data.setUint32(offset, numChannels * sampleRate * (sampleBits / 8), littleEndian);
  offset += 4;
  data.setUint16(offset, numChannels * (sampleBits / 8), littleEndian);
  offset += 2;
  data.setUint16(offset, sampleBits, littleEndian);
  offset += 2;

  // data chunk
  writeString(data, offset, 'data');
  offset += 4;
  data.setUint32(offset, bytes.byteLength, littleEndian);
  offset += 4;

  // PCM data
  for (let i = 0; i < bytes.byteLength; i++) {
    data.setUint8(offset, bytes.getUint8(i));
    offset++;
  }

  return data;
}

/**
 * Check if system uses little endian byte order
 */
export function isLittleEndian(): boolean {
  const buffer = new ArrayBuffer(2);
  new DataView(buffer).setInt16(0, 256, true);
  return new Int16Array(buffer)[0] === 256;
}
