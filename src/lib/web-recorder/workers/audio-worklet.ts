/// <reference path="./audio-worklet.d.ts" />

/**
 * Audio Worklet Processor
 *
 * This file is loaded as an AudioWorklet module.
 * It processes audio in 128-sample chunks and accumulates to 4096 samples
 * before sending to the main thread.
 */

class AudioProcessor extends AudioWorkletProcessor {
  private buffer: number[] = [];
  private bufferSize = 4096;
  private counter = 0;

  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 4096;
    this.counter = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];

    if (input.length > 0) {
      const channelData = input[0]; // Currently only processing one channel

      // Accumulate samples (iterate manually to avoid downlevelIteration issue)
      for (let i = 0; i < channelData.length; i++) {
        this.buffer.push(channelData[i]);
      }

      // When buffer reaches bufferSize, send to main thread
      if (this.buffer.length >= this.bufferSize) {
        this.port.postMessage({
          type: 'process',
          channelData: [this.buffer.slice(0, this.bufferSize)]
        });
        this.buffer = this.buffer.slice(this.bufferSize);
      }

      // Send wave data every 16 process calls for visualization
      this.counter++;
      if (this.counter % 16 === 0) {
        this.port.postMessage({
          type: 'wave',
          channelData: [channelData]
        });
      }
    }

    // Return true to keep the processor alive
    return true;
  }
}

registerProcessor('audio-worklet', AudioProcessor);
