import { expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ShaderDetails } from './ShaderDetails'
import type { ComponentProps } from 'react'

vi.mock('../../i18n', () => ({ useI18n: () => ({ t: (key: string, args?: unknown) => key + (args ? JSON.stringify(args) : ''), n: String }) }))
vi.mock('./usePanelFocus', () => ({ usePanelFocus: () => {} }))
type File = ComponentProps<typeof ShaderDetails>['file']
const render = (file: Partial<File>) => renderToStaticMarkup(createElement(ShaderDetails, { file: { fileName: 'local.zip', hash: 'a'.repeat(40), size: 123, metadata: {}, ...file } as File, close() {} }))

it('shows both public origins as escaped text without turning metadata into links or executable markup', () => {
  const html = render({ metadata: { modrinth: { projectId: '<img src=x onerror=attack()>', versionId: 'v' }, curseforge: { projectId: 123, fileId: 456 } } })
  expect(html).toContain('Modrinth · &lt;img src=x onerror=attack()&gt; · CurseForge · 123')
  expect(html).not.toMatch(/<img|<script|<a /)
  expect(html).toContain('a'.repeat(40))
  expect(html).toContain('react.modInfo.bytes')
})

it('does not present directory stat size or malformed hashes as verified archive information', () => {
  const html = render({ isDirectory: true, hash: 'not-a-checksum' })
  expect(html).toContain('react.shaders.folderSize')
  expect(html).toContain('react.modInfo.unknown')
  expect(html).toContain('react.shaders.local')
  expect(html).not.toContain('react.modInfo.bytes')
  expect(html).not.toContain('not-a-checksum')
})
