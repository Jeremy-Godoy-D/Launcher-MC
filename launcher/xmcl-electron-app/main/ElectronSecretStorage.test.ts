import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElectronSecretStorage } from './ElectronSecretStorage'

const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(),
  encryptString: vi.fn(),
  decryptString: vi.fn(),
}))
vi.mock('electron', () => ({ safeStorage }))

describe('protected credential storage', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'launchermc-secret-test-'))
    safeStorage.isEncryptionAvailable.mockReturnValue(true)
    safeStorage.encryptString.mockImplementation((value: string) => Buffer.from(value.split('').reverse().join('')))
    safeStorage.decryptString.mockImplementation((value: Buffer) => value.toString().split('').reverse().join(''))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    vi.resetAllMocks()
  })
  it('round-trips through the system encryption API and deletes on logout', async () => {
    const storage = new ElectronSecretStorage(dir)
    await storage.put('test', 'account', 'sensitive-value')
    expect((await readFile(join(dir, 'test@account'))).subarray(0, 4).toString()).toBe('ENC1')
    expect(await storage.get('test', 'account')).toBe('sensitive-value')
    await storage.put('test', 'account', '')
    expect(await storage.get('test', 'account')).toBeUndefined()
  })
  it.each(['unavailable', 'failed'] as const)('does not write a secret if encryption is %s', async (failure) => {
    if (failure === 'unavailable') safeStorage.isEncryptionAvailable.mockReturnValue(false)
    else safeStorage.encryptString.mockImplementation(() => { throw new Error('keyring failed') })
    await expect(new ElectronSecretStorage(dir).put('test', 'account', 'sensitive-value')).rejects.toThrow('cifrado')
    expect(await readdir(dir)).toEqual([])
  })
  it('rejects a plaintext blob', async () => {
    await writeFile(join(dir, 'test@account'), 'RAW1sensitive-value')
    expect(await new ElectronSecretStorage(dir).get('test', 'account')).toBeUndefined()
  })
})
