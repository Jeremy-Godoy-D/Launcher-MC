import * as iconv from 'iconv-lite'
import { type Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export const MAX_GAME_OUTPUT_UNITS = 1024 * 1024
const CHUNK_BYTES = 64 * 1024
const truncated = '[earlier output truncated]\n'

export function appendGameOutput(previous: string, text: string) {
  const value = previous + text
  if (value.length <= MAX_GAME_OUTPUT_UNITS) return value
  let start = value.length - (MAX_GAME_OUTPUT_UNITS - truncated.length)
  if (value.charCodeAt(start) >= 0xdc00 && value.charCodeAt(start) <= 0xdfff) start++
  return truncated + value.slice(start)
}

/** One Writable per pipe supplies backpressure and keeps decoding in order. */
export async function consumeGameOutput(source: Readable | null | undefined, guess: (data: Buffer) => Promise<string | null>, accept: (text: string) => void) {
  if (!source) return
  let decoder: ReturnType<typeof iconv.getDecoder> | undefined
  let probe = Buffer.alloc(0)
  let asciiPrefix = false
  const publish = (text: string | undefined) => {
    if (!text) return
    for (let offset = 0; offset < text.length;) {
      let end = Math.min(offset + CHUNK_BYTES, text.length)
      if (end < text.length && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff) end--
      accept(text.slice(offset, end)); offset = end
    }
  }
  const decode = async (data: Buffer, end = false) => {
    if (decoder) { publish(decoder.write(data)); return }
    if (!probe.length && data.every(byte => byte < 0x80) && !data.includes(0)) { if (data.length) asciiPrefix = true; publish(data.toString('ascii')); return }
    if (!probe.length && !data.includes(0)) {
      const first = data.findIndex(byte => byte >= 0x80)
      if (first > 0) { asciiPrefix = true; publish(data.subarray(0, first).toString('ascii')); data = data.subarray(first) }
    }
    probe = Buffer.concat([probe, data])
    if (!end && probe.length === 1 && (probe[0] === 0xff || probe[0] === 0xfe)) return
    let encoding = 'utf8'
    try {
      if (!asciiPrefix && probe[0] === 0xff && probe[1] === 0xfe) encoding = 'utf16le'
      else if (!asciiPrefix && probe[0] === 0xfe && probe[1] === 0xff) encoding = 'utf16be'
      else {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(probe, { stream: !end })
        if (!end && !text && probe.length < 4) return
        if (probe.includes(0)) throw new Error('Probe non-UTF8 text encoding')
      }
    } catch {
      const guessed = await guess(probe.subarray(0, CHUNK_BYTES)).catch(() => null)
      if (guessed && guessed.toLowerCase() !== 'ascii' && iconv.encodingExists(guessed)) encoding = guessed
    }
    decoder = iconv.getDecoder(encoding, { stripBOM: !asciiPrefix })
    publish(decoder.write(probe)); probe = Buffer.alloc(0)
  }
  const sink = new Writable({
    highWaterMark: CHUNK_BYTES,
    write(data: Buffer, _encoding, callback) {
      void (async () => {
        for (let offset = 0; offset < data.length; offset += CHUNK_BYTES) await decode(data.subarray(offset, offset + CHUNK_BYTES))
      })().then(() => callback(), callback)
    },
    final(callback) {
      void (async () => {
        if (probe.length) await decode(Buffer.alloc(0), true)
        publish(decoder?.end())
      })().then(() => callback(), callback)
    },
  })
  await pipeline(source, sink)
}
