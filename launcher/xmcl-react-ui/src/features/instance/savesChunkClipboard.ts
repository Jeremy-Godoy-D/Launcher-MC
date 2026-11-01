import { useEffect, useState } from 'react'
import type { SaveChunkData } from '@xmcl/runtime-api/src/services/InstanceSavesService'

let clipboard: SaveChunkData[] = []
const listeners = new Set<() => void>()

export function getSavesChunkClipboard(): SaveChunkData[] {
  return clipboard
}

export function setSavesChunkClipboard(chunks: SaveChunkData[]) {
  clipboard = chunks
  for (const listener of listeners) listener()
}

export function clearSavesChunkClipboard() {
  clipboard = []
  for (const listener of listeners) listener()
}

export function useSavesChunkClipboard(): [SaveChunkData[], (chunks: SaveChunkData[]) => void] {
  const [chunks, setChunks] = useState(clipboard)
  useEffect(() => {
    const update = () => setChunks(clipboard)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  return [chunks, setSavesChunkClipboard]
}
