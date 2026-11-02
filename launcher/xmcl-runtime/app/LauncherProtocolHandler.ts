import { Readable } from 'stream'
import { isCatalogMetadataRead } from '@xmcl/runtime-api/src/util/catalogMetadata'

export interface Context {
  request: Request
  response: Response
  handle: Handler
}

export interface RequestOptions {
  method?: string
  url: string | URL
  headers?: Record<string, any>
  body?: string | Buffer | Readable
  signal?: AbortSignal
  cache?: RequestCache
}

export interface Request {
  method: string
  url: URL
  headers: Record<string, any>
  body?: string | Buffer | Readable
  signal?: AbortSignal
  cache?: RequestCache
  /** Skip remaining protocol interceptors after the current handler, but still run the sink. */
  skipRemainingHandlers?: boolean
}

export interface Response {
  status?: number
  headers: Record<string, any>
  body?: string | Buffer | Readable
  /** Return this response without running remaining interceptors or a sink. */
  handled?: boolean
}

export interface Handler {
  (context: Context): Promise<void> | void
}

export type ResolvedResponse = Response & {
  [P in keyof Pick<Response, 'headers' | 'status'>]-?: Response[P];
}

/**
 * The universal http-like protocol handler.
 *
 * This can handle the request from
 * 1. HTTP server hosted by the launcher (yggdrasil server)
 * 2. URL drop to launcher UI
 * 3. open-url event or launcher process startup argument
 * 4. HTTP request from the browser process
 *
 * The drop in request or localhost request will be transformed into xmcl:// protocol
 */
export class LauncherProtocolHandler {
  private handlers: [string, Handler][] = []
  private sinkHandlers: Record<string, Handler> = {}
  private catalogRequests = new Map<string, { abort: () => void; finish: () => void }>()
  private cancelledCatalogRequests = new Map<string, ReturnType<typeof setTimeout>>()

  private catalogCancellation(request: Request): ResolvedResponse | undefined {
    if (request.url.origin !== 'http://launcher' || !request.url.pathname.startsWith('/catalog-request/')) return
    const id = request.url.pathname.slice('/catalog-request/'.length)
    if (request.method !== 'POST' || !this.catalogId(id) || request.url.search) return { status: 404, headers: {} }
    const active = this.catalogRequests.get(id)
    if (active) { active.abort(); active.finish() }
    else if (!this.cancelledCatalogRequests.has(id) && this.cancelledCatalogRequests.size < 256) {
      // Cancellation can arrive before Chromium dispatches the original protocol request.
      const timer = setTimeout(() => this.cancelledCatalogRequests.delete(id), 30000)
      timer.unref(); this.cancelledCatalogRequests.set(id, timer)
    }
    return { status: 204, headers: { 'cache-control': 'no-store' } }
  }

  private catalogId(id: unknown): id is string { return typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) }

  private beginCatalogRequest(request: Request) {
    const key = Object.keys(request.headers).find(key => key.toLowerCase() === 'x-grimo-catalog-request'), id: unknown = key ? request.headers[key] : undefined
    if (key) delete request.headers[key]
    if (!this.catalogId(id) || !isCatalogMetadataRead(request.url, request.method)) return
    if (this.catalogRequests.has(id) || this.catalogRequests.size >= 64) throw new Error('Catalog request capacity reached')
    const controller = new AbortController()
    request.signal = request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal
    const cancelled = this.cancelledCatalogRequests.get(id)
    if (cancelled) { clearTimeout(cancelled); this.cancelledCatalogRequests.delete(id); controller.abort() }
    const timer = setTimeout(() => { controller.abort(); finish() }, 30000)
    timer.unref()
    const finish = () => { clearTimeout(timer); this.catalogRequests.delete(id) }
    this.catalogRequests.set(id, { abort: () => controller.abort(), finish })
    return finish
  }

  /**
   * Register a http-like handler for a specific protocol
   *
   * @param protocol The protocol
   * @param handler The protocol handler
   */
  registerHandler(protocol: string, handler: Handler, sink = false) {
    if (sink) {
      if (this.sinkHandlers[protocol]) {
        throw new TypeError(`Handler for protocol ${protocol} already registered`)
      }
      this.sinkHandlers[protocol] = handler
      return
    }
    this.handlers.push([protocol, handler])
  }

  getProtocols() {
    return [...new Set(this.handlers.map(v => v[0]))]
  }

  async handle(request: RequestOptions): Promise<ResolvedResponse> {
    const handle: Handler = async (ctx) => {
      const handers = this.handlers.filter(v => `${v[0]}:` === ctx.request.url.protocol).map(v => v[1])
      for (const handler of handers) {
        await handler(ctx)
        if (ctx.response.handled) return
        if (ctx.request.skipRemainingHandlers) break
      }
      await this.sinkHandlers[ctx.request.url.protocol.substring(0, ctx.request.url.protocol.length - 1)]?.(ctx)
    }
    const context: Context = {
      request: {
        method: request.method ?? 'GET',
        url: typeof request.url === 'string' ? new URL(request.url, 'xmcl://launcher') : request.url,
        headers: request.headers || {},
        body: request.body,
        signal: request.signal,
        cache: request.cache,
      },
      response: {
        headers: {},
      },
      handle,
    }
    const cancellation = this.catalogCancellation(context.request)
    if (cancellation) return cancellation
    // Electron 43 constructs protocol Requests without a cancellation signal. A random per-read ID bridges it.
    const finish = this.beginCatalogRequest(context.request)
    try {
      if (finish) context.request.signal?.throwIfAborted()
      await handle(context)
      if (finish && context.response.body instanceof Readable) context.response.body.once('end', finish).once('close', finish).once('error', finish)
      else finish?.()
    } catch (error) {
      finish?.()
      if (finish && context.request.signal?.aborted) return { status: 499, headers: { 'cache-control': 'no-store' } }
      throw error
    }
    return {
      status: context.response.status ?? 404,
      headers: context.response.headers,
      body: context.response.body,
    }
  }
}
