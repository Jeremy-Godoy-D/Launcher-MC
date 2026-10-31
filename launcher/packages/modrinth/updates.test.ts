import { expect, it, vi } from 'vitest'
import { ModrinthV2Client } from './index'

it('adds an optional release filter while preserving the previous request without it', async () => {
  const fetch = vi.fn(async () => new Response('{}')), client = new ModrinthV2Client({ fetch })
  const signal = new AbortController().signal
  await client.getLatestVersionsFromHashes(['sha1'], { algorithm: 'sha1', loaders: ['fabric'], gameVersions: ['1.21.1'] }, signal)
  await client.getLatestVersionsFromHashes(['sha1'], { algorithm: 'sha1', loaders: ['fabric'], gameVersions: ['1.21.1'], versionTypes: ['release'] }, signal)
  const calls = fetch.mock.calls as unknown as Array<[URL, RequestInit]>
  expect(calls[0][0].href).toBe('https://api.modrinth.com/v2/version_files/update')
  expect(JSON.parse(calls[0][1].body as string)).toEqual({ hashes: ['sha1'], algorithm: 'sha1', loaders: ['fabric'], game_versions: ['1.21.1'] })
  expect(JSON.parse(calls[1][1].body as string)).toEqual({ hashes: ['sha1'], algorithm: 'sha1', loaders: ['fabric'], game_versions: ['1.21.1'], version_types: ['release'] })
  expect(calls.every(call => call[1].signal === signal)).toBe(true)
})
