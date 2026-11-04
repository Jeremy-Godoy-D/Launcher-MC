import { AUTHORITY_DEV } from '@xmcl/runtime-api'
import { YggdrasilTexture, YggdrasilTexturesInfo } from '@xmcl/user'
import { generateKeyPair, sign } from 'crypto'
import { promisify } from 'node:util'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import { LauncherAppPlugin } from '~/app'
import { UserService } from '~/user'

const generateSigningKeys = promisify(generateKeyPair)
const signTexture = promisify(sign)

export const pluginYggdrasilHandler: LauncherAppPlugin = (app) => {
  const logger = app.getLogger('YggdrasilServer')
  let signingKeys: ReturnType<typeof generateSigningKeys> | undefined
  const getSigningKeys = () => signingKeys ??= generateSigningKeys('rsa', { modulusLength: 2048 })

  const getProfile = async (name: string) => {
    const userService = await app.registry.get(UserService)
    const offline = Object.values(userService.state.users).find(v => v.authority === AUTHORITY_DEV)
    if (offline) {
      const profiles = Object.values(offline.profiles)
      const founded = profiles.find(p => p.name === name || p.id === name || p.id.replaceAll('-', '') === name)
      if (founded) {
        return founded
      }
    }
    return undefined
  }

  const queryProfile = async (id: string, needSign?: boolean) => {
    const profile = await getProfile(id)
    logger.log(`Get profile for ${id}: %o`, profile)

    const addr = `http://localhost:${await app.serverPort}/yggdrasil`
    const transformTexture = (text?: YggdrasilTexture) => {
      if (!text) return text
      return { ...text, url: `${addr}/textures?href=${encodeURIComponent(text.url)}` }
    }
    if (profile) {
      const unsignedProfileId = profile.id.replaceAll('-', '')
      const textureInfo: YggdrasilTexturesInfo = {
        timestamp: Date.now(),
        profileId: unsignedProfileId,
        profileName: profile.name,
        textures: {
          SKIN: transformTexture(profile.textures.SKIN),
          CAPE: transformTexture(profile.textures.CAPE),
          ELYTRA: transformTexture(profile.textures.ELYTRA),
        },
      }
      logger.log(`Transform texture info for ${id}: %o`, textureInfo)
      const textureString = Buffer.from(JSON.stringify(textureInfo)).toString('base64')
      const signature = needSign
        ? await signTexture('RSA-SHA1', Buffer.from(textureString), (await getSigningKeys()).privateKey)
        : undefined
      const transformed = {
        id: unsignedProfileId,
        name: profile.name,
        properties: [
          { name: 'uploadableTextures', value: 'skin,cape' },
          {
            name: 'textures',
            value: textureString,
            signature: signature?.toString('base64'),
          },
        ],
      }
      logger.log(`Encode profile for ${id}: %o`, transformed)
      return JSON.stringify(transformed)
    }
    return undefined
  }

  app.protocol.registerHandler('xmcl', async ({ request, response, handle }) => {
    if (request.url.pathname.startsWith('/yggdrasil')) {
      logger.log(`Process ${request.url.toString()}`)
      const pathname = request.url.pathname.substring('/yggdrasil'.length) || ''
      if (pathname === '/' || pathname === '') {
        response.status = 200
        response.body = JSON.stringify({
          meta: {
            implementationName: 'xmcl-offline-server',
            implementationVersion: '0.0.1',
            serverName: 'XMCL Offline Server',
          },
          skinDomains: [
            'localhost',
          ],
          signaturePublickey: (await getSigningKeys()).publicKey.export({ type: 'spki', format: 'pem' }),
        })
      } else if (pathname === '/sessionserver/session/minecraft/join' && request.method === 'POST') {
        if (request.body instanceof Readable) {
          request.body.resume()
          await finished(request.body)
        }
        response.status = 240
      } else if (pathname.startsWith('/sessionserver/session/minecraft/hasJoined') && request.method === 'GET') {
        const username = request.url.searchParams.get('username')!
        try {
          const payload = await queryProfile(username)
          if (payload) {
            response.status = 200
            response.headers = {
              'content-type': 'application/json',
            }
            response.body = payload
          } else {
            response.status = 204
          }
        } catch {
          response.status = 204
        }
      } else if (pathname.startsWith('/sessionserver/session/minecraft/profile/')) {
        const uuid = pathname.substring(pathname.lastIndexOf('/') + 1)
        const needSigned = request.url.searchParams.get('unsigned') === 'false'

        await queryProfile(uuid, needSigned).then((payload) => {
          if (payload) {
            response.headers['content-type'] = 'application/json'
            response.status = 200
            response.body = payload
          } else {
            response.status = 204
          }
        }, () => {
          response.status = 204
        })
      } else if (pathname.startsWith('/textures')) {
        const target = request.url.searchParams.get('href')
        if (!target) {
          logger.log(`Not found texture: ${target}`)
          response.status = 400
        } else {
          logger.log(`Delegate texture request: ${target}`)
          // delegate to other handler
          await handle({
            request: {
              headers: request.headers,
              body: request.body,
              method: request.method,
              url: new URL(target),
            },
            response,
            handle,
          })

          logger.log(`Get response from delegate: ${response.status} %o`, response.headers)
        }
      } else {
        logger.log(`Not found route: ${pathname}`)
        response.status = 404
      }
    }
  })
}
