export function redactLogMessage(message: string): string {
  return message
    .replace(/(authorization["']?\s*[:=]\s*["']?)(?:Bearer|Basic)\s+[^\s"',}]+/gi, '$1[REDACTED]')
    .replace(/((?:--)?(?:access[_-]?token|refresh[_-]?token|client[_-]?secret|password|x-api-key|apiKey)["']?\s*(?:[:=]\s*|\s+)["']?)[^\s"',}&]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:code|token|access_token|refresh_token)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
}
