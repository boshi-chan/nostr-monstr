import { marked } from 'marked'
import createDOMPurify from 'dompurify'

const ALLOWED_TAGS = [
  'a',
  'abbr',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'ul',
]

const ALLOWED_ATTR = ['href', 'title', 'rel', 'target']
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):)/i

marked.use({
  breaks: true,
  gfm: true,
})

type DOMPurifyInstance = ReturnType<typeof createDOMPurify> | null

let purifier: DOMPurifyInstance = null

function getPurifier(): DOMPurifyInstance {
  if (purifier) return purifier
  if (typeof window === 'undefined') {
    return null
  }
  purifier = createDOMPurify(window)
  return purifier
}

export function renderMarkdownSafe(markdown?: string | null): string {
  if (!markdown) return ''
  const dirty = marked.parse(markdown)
  const domPurify = getPurifier()
  if (!domPurify) {
    return typeof dirty === 'string' ? dirty : ''
  }
  return domPurify.sanitize(typeof dirty === 'string' ? dirty : '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
    ALLOW_DATA_ATTR: false,
  })
}
