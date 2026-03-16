/// <reference lib="webworker" />

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: unknown)
  abstract process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: unknown) => AudioWorkletProcessor,
): void

const MIN_CHUNK_SIZE = 512

let globalPointer = 0
const globalBuffer = new Float32Array(MIN_CHUNK_SIZE)

class VADProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]) {
    const buffer = inputs[0]?.[0]
    if (!buffer)
      return true

    if (buffer.length > MIN_CHUNK_SIZE) {
      this.port.postMessage({ buffer })
      return true
    }

    const remaining = MIN_CHUNK_SIZE - globalPointer
    if (buffer.length >= remaining) {
      globalBuffer.set(buffer.subarray(0, remaining), globalPointer)
      this.port.postMessage({ buffer: globalBuffer.slice() })
      globalBuffer.fill(0)
      globalBuffer.set(buffer.subarray(remaining), 0)
      globalPointer = buffer.length - remaining
      return true
    }

    globalBuffer.set(buffer, globalPointer)
    globalPointer += buffer.length
    return true
  }
}

registerProcessor('vad-audio-worklet-processor', VADProcessor)
