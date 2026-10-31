import { expect, test } from 'vitest'
import { isBootstrapSender } from './bootstrapSender'

test('bootstrap accepts only the built-in renderer document in the main window and top frame', () => {
  const frame = { url: 'http://xmcl.runtime/index.html?bootstrap#/setup' }
  const main = { mainFrame: frame } as any
  const event = { sender: main, senderFrame: frame } as any
  expect(isBootstrapSender(event, main, 'http://xmcl.runtime/index.html')).toBe(true)
  expect(isBootstrapSender(event, undefined, 'http://xmcl.runtime/index.html')).toBe(false)
  expect(isBootstrapSender({ ...event, sender: { mainFrame: frame } }, main, 'http://xmcl.runtime/index.html')).toBe(false)
  expect(isBootstrapSender({ ...event, senderFrame: { ...frame } }, main, 'http://xmcl.runtime/index.html')).toBe(false)
  for (const url of ['http://xmcl.runtime.evil/index.html', 'https://xmcl.runtime/index.html', 'http://xmcl.runtime/logger.html', 'about:blank']) {
    frame.url = url
    expect(isBootstrapSender(event, main, 'http://xmcl.runtime/index.html')).toBe(false)
  }
})
