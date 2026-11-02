import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import { safeCatalogImage } from './api'

const markdown = new MarkdownIt({ html: true, linkify: false, breaks: true })
export function catalogDescription(body: string, isMarkdown: boolean) {
  if (typeof body !== 'string' || body.length > 1024 * 1024) throw new Error('Description is too large')
  const fragment = DOMPurify.sanitize(isMarkdown ? markdown.render(body) : body, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'code', 'pre', 'blockquote', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'del', 'details', 'summary'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'],
    ALLOWED_URI_REGEXP: /^https:\/\//i,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    SANITIZE_NAMED_PROPS: true,
    RETURN_DOM_FRAGMENT: true,
  })
  // DOMPurify permits some data-image URIs by default; catalog media must be credential-free HTTPS.
  for (const image of fragment.querySelectorAll('img')) {
    const source = safeCatalogImage(image.getAttribute('src'))
    if (!source) { image.remove(); continue }
    image.src = source; image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'
    if (!image.hasAttribute('alt')) image.alt = ''
  }
  for (const link of fragment.querySelectorAll('a')) {
    const href = safeCatalogImage(link.getAttribute('href'))
    if (!href) { link.removeAttribute('href'); continue }
    link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'
  }
  const content = document.createElement('div')
  content.appendChild(fragment)
  return content.innerHTML
}
