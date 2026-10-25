/**
 * Resolves a human readable label for a DOM element, Heap-style.
 *
 * Resolution order:
 * 1. The element's own visible text
 * 2. Accessible names: aria-label, aria-labelledby, associated <label>, title, alt, value (buttons), placeholder
 * 3. "Close text": the nearest heading / label / sibling text found while walking up a few ancestors
 */

export type TextSource =
  | 'text'
  | 'aria-label'
  | 'aria-labelledby'
  | 'label'
  | 'title'
  | 'alt'
  | 'value'
  | 'placeholder'
  | 'name'
  | 'nearby'
  | 'masked'

export interface ResolvedText {
  text: string
  source: TextSource
}

export interface TextOptions {
  maxTextLength: number
  nearbyTextDepth: number
  maskSelector: string
  ignoreSelector: string
}

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'IFRAME',
  // children of media elements are fallback content for unsupported browsers
  'VIDEO',
  'AUDIO',
])

const NEARBY_LABEL_SELECTOR =
  'h1,h2,h3,h4,h5,h6,[role="heading"],legend,caption,figcaption,label'

// upper bound on nodes visited when collecting text, so huge containers can't stall the page
const MAX_NODES_VISITED = 300

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g
// 13-19 digits, optionally separated by spaces or dashes (credit cards)
const CARD_RE = /\b\d(?:[ -]?\d){12,18}\b/g

export function normalizeText(text: string, maxLength: number): string {
  const collapsed = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(EMAIL_RE, '[email]')
    .replace(CARD_RE, '[redacted]')
  return collapsed.length > maxLength
    ? collapsed.slice(0, maxLength - 1).trimEnd() + '…'
    : collapsed
}

const isHidden = (el: Element): boolean =>
  el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true'

/**
 * Collects visible text of an element without relying on innerText (which forces layout).
 */
export function visibleText(el: Element, opts: TextOptions): string {
  const parts: string[] = []
  let visited = 0

  const walk = (node: Node): void => {
    if (visited++ > MAX_NODES_VISITED) return
    if (node.nodeType === 3 /* TEXT_NODE */) {
      parts.push(node.nodeValue ?? '')
      return
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return
    const child = node as Element
    if (
      SKIP_TAGS.has(child.tagName.toUpperCase()) ||
      isHidden(child) ||
      matches(child, opts.ignoreSelector) ||
      matches(child, opts.maskSelector)
    ) {
      return
    }
    child.childNodes.forEach(walk)
    // block level separation, so "<li>a</li><li>b</li>" reads as "a b"
    parts.push(' ')
  }

  el.childNodes.forEach(walk)
  return normalizeText(parts.join(''), opts.maxTextLength)
}

export function matches(el: Element, selector: string): boolean {
  if (!selector) return false
  try {
    return el.matches(selector)
  } catch {
    return false
  }
}

export function closest(el: Element, selector: string): Element | null {
  if (!selector) return null
  try {
    return el.closest(selector)
  } catch {
    return null
  }
}

const attr = (el: Element, name: string, opts: TextOptions): string =>
  normalizeText(el.getAttribute(name) ?? '', opts.maxTextLength)

function labelledByText(el: Element, opts: TextOptions): string {
  const ids = el.getAttribute('aria-labelledby')
  if (!ids) return ''
  const doc = el.ownerDocument
  return normalizeText(
    ids
      .split(/\s+/)
      .map((id) => doc.getElementById(id))
      .filter((n): n is HTMLElement => !!n)
      .map((n) => visibleText(n, opts))
      .join(' '),
    opts.maxTextLength
  )
}

function associatedLabelText(el: Element, opts: TextOptions): string {
  const labels = (el as HTMLInputElement).labels
  if (labels && labels.length) {
    return normalizeText(
      Array.from(labels)
        .map((l) => visibleText(l, opts))
        .join(' '),
      opts.maxTextLength
    )
  }
  const parentLabel = el.parentElement?.closest('label')
  return parentLabel ? visibleText(parentLabel, opts) : ''
}

function descendantAlt(el: Element, opts: TextOptions): string {
  const img = el.querySelector('img[alt],[role="img"][aria-label]')
  if (!img) return ''
  return attr(img, img.hasAttribute('alt') ? 'alt' : 'aria-label', opts)
}

function svgTitle(el: Element, opts: TextOptions): string {
  const title = el.querySelector('svg title')
  return title ? normalizeText(title.textContent ?? '', opts.maxTextLength) : ''
}

const isFormField = (el: Element): boolean =>
  ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName.toUpperCase())

const isForm = (el: Element): boolean => el.tagName.toUpperCase() === 'FORM'

const isMedia = (el: Element): boolean =>
  ['VIDEO', 'AUDIO'].includes(el.tagName.toUpperCase())

// a form's full text is every label in it, so name it by its own heading / legend instead
function formHeading(el: Element, opts: TextOptions): string {
  const heading = el.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"],legend')
  return heading ? visibleText(heading, opts) : ''
}

const isButtonLikeInput = (el: Element): boolean =>
  el.tagName.toUpperCase() === 'INPUT' &&
  ['button', 'submit', 'reset'].includes(
    (el.getAttribute('type') ?? '').toLowerCase()
  )

/**
 * Finds the closest meaningful text around an element that has no label of its own,
 * e.g. an icon-only "delete" button inside a card titled "Invoice #42".
 */
function nearbyText(el: Element, opts: TextOptions): string {
  let current: Element | null = el
  for (let depth = 0; current && depth < opts.nearbyTextDepth; depth++) {
    // previous siblings are usually what a user reads right before the element
    let sibling = current.previousElementSibling
    while (sibling) {
      if (!isHidden(sibling) && !matches(sibling, opts.maskSelector)) {
        const text = visibleText(sibling, opts)
        if (text) return text
      }
      sibling = sibling.previousElementSibling
    }

    const parent: Element | null = current.parentElement
    if (!parent || parent === el.ownerDocument.body) break

    const heading = parent.querySelector(NEARBY_LABEL_SELECTOR)
    if (heading && heading !== el && !el.contains(heading)) {
      const text = visibleText(heading, opts)
      if (text) return text
    }
    current = parent
  }
  return ''
}

export function resolveText(el: Element, opts: TextOptions): ResolvedText {
  if (matches(el, opts.maskSelector) || closest(el, opts.maskSelector)) {
    return { text: '[masked]', source: 'masked' }
  }

  const candidates: [TextSource, () => string][] = [
    [
      'text',
      () =>
        isFormField(el) || isForm(el) || isMedia(el)
          ? ''
          : visibleText(el, opts),
    ],
    ['aria-label', () => attr(el, 'aria-label', opts)],
    ['aria-labelledby', () => labelledByText(el, opts)],
    ['label', () => (isFormField(el) ? associatedLabelText(el, opts) : '')],
    ['value', () => (isButtonLikeInput(el) ? attr(el, 'value', opts) : '')],
    ['title', () => attr(el, 'title', opts)],
    ['text', () => (isForm(el) ? formHeading(el, opts) : '')],
    ['alt', () => attr(el, 'alt', opts) || descendantAlt(el, opts)],
    ['title', () => svgTitle(el, opts)],
    ['placeholder', () => attr(el, 'placeholder', opts)],
    ['nearby', () => nearbyText(el, opts)],
    ['name', () => attr(el, 'name', opts)],
  ]

  for (const [source, get] of candidates) {
    const text = get()
    if (text) return { text, source }
  }
  return { text: '', source: 'text' }
}
