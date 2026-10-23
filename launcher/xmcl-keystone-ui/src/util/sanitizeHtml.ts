import DOMPurify from 'dompurify'

// Catalog authors control this markup; keep it inside the content surface.
export function sanitizeHtml(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style', 'autofocus'],
    SANITIZE_NAMED_PROPS: true,
  })
}

export function sanitizeIcon(svg: string) {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS: ['style', 'use', 'image', 'foreignObject', 'animate', 'set'],
    FORBID_ATTR: ['style'],
    SANITIZE_NAMED_PROPS: true,
  })
}
