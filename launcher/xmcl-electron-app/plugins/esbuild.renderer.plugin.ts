import { basename } from 'path'
import { cleanUrl } from './util'
import { Plugin } from 'esbuild'
import { rendererTarget } from '../../scripts/renderer'

/**
 * Resolve import starts with `/@renderer` and ends with `.html` extension to the real file url.
 */
export default function createRendererPlugin(): Plugin {
  const renderer = rendererTarget()
  const devPort = Number(process.env.XMCL_DEV_PORT ?? renderer.port)
  return {
    name: 'resolve-renderer',
    setup(build) {
      build.onResolve({ filter: /@renderer\/.+/ }, async ({ path }) => ({ path: basename(path) + '?renderer', namespace: 'renderer' }))
      build.onLoad({ filter: /^.+\?renderer$/, namespace: 'renderer' }, async ({ path }) => {
        const page = cleanUrl(path)
        // The removed browser has no React entry; old host references land on the main preview until stage 8 removes them.
        const clean = renderer.name === 'react' && page === 'browser.html' ? 'index.html' : page
        const outDir = build.initialOptions.outdir
        return {
          contents:
          build.initialOptions.plugins!.find(v => v.name === 'dev')
            ? `export default "http://localhost:${devPort}/${basename(clean)}"`
            : `import { join } from 'path'; import { pathToFileURL } from 'url'; export default pathToFileURL(join(__dirname, 'renderer', ${JSON.stringify(clean)})).toString();`,
          resolveDir: outDir,
        }
      })
    },
  }
}
