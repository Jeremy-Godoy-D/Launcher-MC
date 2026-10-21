import { describe, expect, it } from 'vitest'
import { redactLogMessage } from './redactLogMessage'

describe('credential log redaction', () => {
  it.each([
    '--accessToken secret-value --username player',
    '{"access_token":"secret-value","refresh_token":"secret-value"}',
    'Authorization: Bearer secret-value',
    "{ 'x-api-key': 'secret-value' }",
    'https://localhost/callback?code=secret-value&state=keep',
  ])('redacts credentials in %s', (message) => {
    expect(redactLogMessage(message)).not.toContain('secret-value')
    expect(redactLogMessage(message)).toContain('[REDACTED]')
  })
  it('preserves diagnostic information without credentials', () => {
    expect(redactLogMessage('Download failed: HTTP 503; instance test')).toBe('Download failed: HTTP 503; instance test')
  })
})
