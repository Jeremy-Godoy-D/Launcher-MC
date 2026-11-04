import { expect, it } from 'vitest'
import { deskGapNavigation, externalNavigation, rendererNavigation } from './rendererNavigation'

it('allows only the configured renderer origin, including its exact development port', () => {
  for (const entry of ['http://xmcl.runtime/index.html', 'http://localhost:3001/index.html']) {
    expect(rendererNavigation(new URL('logger.html?context=one', entry).href, entry)).toBe(true)
    for (const target of ['http://xmcl.runtime.evil/index.html', 'http://localhost.evil:3001/index.html', 'http://localhost:3000/index.html', 'https://localhost:3001/index.html', 'file:///index.html', 'data:text/html,hello', 'blob:' + entry, 'http://user:password@localhost:3001/index.html']) expect(rendererNavigation(target, entry)).toBe(false)
  }
})
it('limits file navigation to the exact packaged document rather than the shared opaque origin', () => {
  const entry = 'file:///C:/launcher/renderer/logger.html'
  expect(rendererNavigation(entry + '?source=live#tail', entry)).toBe(true)
  for (const target of ['file:///C:/other.html', 'file://remote/C:/launcher/renderer/logger.html', 'custom:/C:/launcher/renderer/logger.html']) expect(rendererNavigation(target, entry)).toBe(false)
})
it('opens only explicit web and email protocols outside the privileged window', () => {
  for (const target of ['https://example.org/path?a=1', 'http://example.org/', 'mailto:support@example.org']) expect(externalNavigation(target)).toBe(target)
  for (const target of ['javascript:alert(1)', 'file:///C:/app.exe', 'data:text/html,hello', 'ms-msdt:/argument', 'shell:AppsFolder', 'https://name:secret@example.org/', 'https://example.org/\nfile', 'not a url']) expect(externalNavigation(target)).toBeUndefined()
})
it('pins the native virtual host only after the expected DeskGap entry and rejects host/path substring tricks', () => {
  const accept = deskGapNavigation('logger.html')
  for (const target of ['https://evil.org/.deskgap.test/logger.html', 'https://view.deskgap.test.evil/logger.html', 'https://view.deskgap.test/foreign.html', 'http://view.deskgap.test/logger.html', 'https://user@view.deskgap.test/logger.html']) expect(accept(target)).toBe(false)
  expect(accept('https://renderer-one.deskgap.test/logger.html')).toBe(true)
  expect(accept('https://renderer-one.deskgap.test/logger.html?context=one')).toBe(true)
  expect(accept('https://renderer-two.deskgap.test/logger.html')).toBe(false)
})
