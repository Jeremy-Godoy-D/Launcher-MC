import type { IpcMainInvokeEvent, WebContents } from 'electron'

export function isBootstrapSender(event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>, main: WebContents | undefined, rendererUrl: string) {
  if (!main || event.sender !== main || event.senderFrame !== main.mainFrame) return false
  try {
    const actual = new URL(event.senderFrame!.url)
    const expected = new URL(rendererUrl)
    return actual.origin === expected.origin && actual.pathname === expected.pathname
  } catch { return false }
}
