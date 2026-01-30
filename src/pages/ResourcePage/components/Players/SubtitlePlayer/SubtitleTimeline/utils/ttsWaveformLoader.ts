/**
 * TTS 块波形按需加载：队列（限制并发）+ 内存缓存
 * 方案 2：预览时调用 extractWaveform，main 进程侧已有磁盘缓存
 */

const TTS_WAVEFORM_SAMPLES = 150;
const MAX_CONCURRENT = 3;

export interface WaveformData {
  peaks: number[];
  duration: number;
}

const cache = new Map<string, WaveformData>();
const queue: Array<{
  audioPath: string;
  resolve: (data: WaveformData) => void;
  reject: (err: unknown) => void;
}> = [];
let inFlight = 0;

function pump(): void {
  if (inFlight >= MAX_CONCURRENT || queue.length === 0) return;

  const next = queue.shift();
  if (!next) return;

  const { audioPath, resolve, reject } = next;
  inFlight++;

  const api = typeof window !== 'undefined' && window.YUA?.ffmpeg?.extractWaveform;
  if (!api) {
    inFlight--;
    reject(new Error('ffmpeg.extractWaveform 不可用'));
    pump();
    return;
  }

  api({ inputPath: audioPath, samplesCount: TTS_WAVEFORM_SAMPLES })
    .then((result: { peaks: number[]; duration: number }) => {
      const data = { peaks: result.peaks, duration: result.duration };
      cache.set(audioPath, data);
      inFlight--;
      resolve(data);
      pump();
    })
    .catch((err: unknown) => {
      inFlight--;
      reject(err);
      pump();
    });
}

/**
 * 获取 TTS 音频的波形数据（按需生成，带队列与缓存）
 */
export function getTTSBlockWaveform(audioPath: string): Promise<WaveformData> {
  const cached = cache.get(audioPath);
  if (cached) return Promise.resolve(cached);

  return new Promise<WaveformData>((resolve, reject) => {
    queue.push({ audioPath, resolve, reject });
    pump();
  });
}
