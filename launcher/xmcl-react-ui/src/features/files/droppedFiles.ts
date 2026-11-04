export interface DroppedFile { path: string; name: string; folder: boolean }
export function droppedFiles(files: readonly File[], getPath: (file: File) => string): DroppedFile[] {
  if (!files.length || files.length > 256) throw new Error('Unsupported file drop')
  const seen = new Set<string>()
  return files.map(file => {
    const path = getPath(file)
    const nativeHandle = path.startsWith('deskgap-file-handle:') && path.length > 'deskgap-file-handle:'.length
    if (!path || path.length > 32768 || path.includes('\0') || path.includes('\r') || path.includes('\n') || !nativeHandle && !/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(path) || seen.has(path)) throw new Error('Invalid native file path')
    seen.add(path)
    return { path, name: file.name, folder: !file.type && file.size === 0 }
  })
}
export function acceptsDrop(type: 'mods' | 'resourcepacks' | 'shaderpacks' | 'worlds' | 'archive', files: DroppedFile[]) {
  if (!files.length || (type === 'worlds' || type === 'archive') && files.length !== 1) return false
  return files.every(file => type === 'archive' ? /\.(zip|mrpack)$/i.test(file.name) : type === 'mods' ? /\.(jar|zip|litemod)$/i.test(file.name) : /\.zip$/i.test(file.name) || file.folder)
}
