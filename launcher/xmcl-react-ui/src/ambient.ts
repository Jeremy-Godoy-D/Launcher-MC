import overworld from './assets/ambient/vanilla-caves.mp4'
import overworldPoster from './assets/ambient/vanilla-caves.webp'
import nether from './assets/ambient/vanilla-nether.mp4'
import netherPoster from './assets/ambient/vanilla-nether.webp'
import end from './assets/ambient/vanilla-end.mp4'
import endPoster from './assets/ambient/vanilla-end.webp'

const scenes = [
  { id: 'overworld', video: overworld, poster: overworldPoster },
  { id: 'nether', video: nether, poster: netherPoster },
  { id: 'end', video: end, poster: endPoster },
]

export function ambientScene(path: string) {
  // Decorative assignment stays stable without inferring a world's dimension or reading its files.
  let hash = 0
  for (const character of path) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return scenes[hash % scenes.length]
}
