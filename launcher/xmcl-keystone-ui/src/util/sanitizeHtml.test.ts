// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { sanitizeHtml, sanitizeIcon } from './sanitizeHtml'

describe('external catalog markup', () => {
  it('keeps readable content and removes executable or page-altering markup', () => {
    const clean = sanitizeHtml('<h2>Mods</h2><strong>Safe</strong><a target="browser" href="https://example.com">Details</a><img src="https://example.com/a.png" onerror="alert(1)"><script>alert(1)</script><style>body{display:none}</style><a href="javascript:alert(1)">Bad</a><form><input autofocus></form><p style="position:fixed">Text</p>')
    expect(clean).toContain('<h2>Mods</h2>')
    expect(clean).toContain('href="https://example.com"')
    expect(clean).toContain('target="browser"')
    expect(clean).not.toMatch(/onerror|<script|<style|javascript:|<form|<input|autofocus|position:fixed/)
  })

  it('keeps SVG paths while removing event handlers and external references', () => {
    const clean = sanitizeIcon('<svg onload="alert(1)"><path fill="currentColor" d="M0 0h10v10z"/><foreignObject><iframe src="https://example.com"/></foreignObject><use href="https://example.com/a.svg#icon"/><image href="https://example.com/a.svg"/></svg>')
    expect(clean).toContain('<path')
    expect(clean).not.toMatch(/onload|iframe|foreignObject|<use|<image|https:/)
  })
})
