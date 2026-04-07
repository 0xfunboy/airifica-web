const PCM_16_BIT_MAX = 0x7FFF

export type WavPcmData = {
  sampleRate: number
  samples: Float32Array
}

function clampSample(sample: number) {
  return Math.max(-1, Math.min(1, sample))
}

export function concatFloat32Chunks(chunks: readonly Float32Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return merged
}

export function encodeMono16BitWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2
  const dataLength = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)

  let offset = 0
  const writeString = (value: string) => {
    for (let index = 0; index < value.length; index += 1)
      view.setUint8(offset + index, value.charCodeAt(index))
    offset += value.length
  }

  writeString('RIFF')
  view.setUint32(offset, 36 + dataLength, true)
  offset += 4
  writeString('WAVE')
  writeString('fmt ')
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint16(offset, 1, true)
  offset += 2
  view.setUint32(offset, sampleRate, true)
  offset += 4
  view.setUint32(offset, sampleRate * bytesPerSample, true)
  offset += 4
  view.setUint16(offset, bytesPerSample, true)
  offset += 2
  view.setUint16(offset, bytesPerSample * 8, true)
  offset += 2
  writeString('data')
  view.setUint32(offset, dataLength, true)
  offset += 4

  for (let index = 0; index < samples.length; index += 1, offset += 2) {
    const clamped = clampSample(samples[index] ?? 0)
    const scaled = clamped < 0 ? clamped * 0x8000 : clamped * PCM_16_BIT_MAX
    view.setInt16(offset, Math.round(scaled), true)
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function readChunkId(view: DataView, offset: number) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  )
}

export async function decodeMono16BitWav(blob: Blob): Promise<WavPcmData> {
  const buffer = await blob.arrayBuffer()
  const view = new DataView(buffer)

  if (buffer.byteLength < 44)
    throw new Error('STT audio buffer is not a valid WAV file.')

  if (readChunkId(view, 0) !== 'RIFF' || readChunkId(view, 8) !== 'WAVE')
    throw new Error('STT audio buffer is not a valid RIFF/WAVE file.')

  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let audioFormat = 0
  let dataOffset = -1
  let dataLength = 0

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readChunkId(view, offset)
    const chunkLength = view.getUint32(offset + 4, true)
    const chunkDataOffset = offset + 8

    if (chunkId === 'fmt ' && chunkLength >= 16) {
      audioFormat = view.getUint16(chunkDataOffset, true)
      channels = view.getUint16(chunkDataOffset + 2, true)
      sampleRate = view.getUint32(chunkDataOffset + 4, true)
      bitsPerSample = view.getUint16(chunkDataOffset + 14, true)
    }
    else if (chunkId === 'data') {
      dataOffset = chunkDataOffset
      dataLength = chunkLength
    }

    offset = chunkDataOffset + chunkLength + (chunkLength % 2)
  }

  if (audioFormat !== 1)
    throw new Error('Only PCM WAV files are supported for server STT.')
  if (channels !== 1)
    throw new Error('Only mono WAV files are supported for server STT.')
  if (bitsPerSample !== 16)
    throw new Error('Only 16-bit WAV files are supported for server STT.')
  if (sampleRate <= 0 || dataOffset < 0 || dataLength <= 0)
    throw new Error('WAV metadata is incomplete for server STT.')

  const sampleCount = Math.floor(dataLength / 2)
  const samples = new Float32Array(sampleCount)
  let readOffset = dataOffset

  for (let index = 0; index < sampleCount; index += 1, readOffset += 2)
    samples[index] = view.getInt16(readOffset, true) / 0x8000

  return {
    sampleRate,
    samples,
  }
}

export function buildSherpaOfflinePayload(samples: Float32Array, sampleRate: number) {
  const headerBytes = 8
  const payload = new Uint8Array(headerBytes + samples.byteLength)
  const view = new DataView(payload.buffer)

  view.setInt32(0, sampleRate, true)
  view.setInt32(4, samples.byteLength, true)
  payload.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength), headerBytes)

  return payload
}
