/**
 * Type declarations for Web Audio API AudioWorklet
 *
 * These types are available in the AudioWorklet global scope
 */

declare function registerProcessor(name: string, processorCtor: typeof AudioWorkletProcessor): void;

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
