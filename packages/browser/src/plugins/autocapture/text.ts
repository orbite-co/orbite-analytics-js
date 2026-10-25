/**
 * Resolves a human readable label for a DOM element, Heap-style.
 *
 * Resolution order:
 * 1. The element's own visible text
 * 2. Accessible names: aria-label, aria-labelledby, associated <label>, title, alt, value (buttons), placeholder
 * 3. "Close text": the nearest heading / label / sibling text found while walking up a few ancestors
 *
 * Containers (carousels, ...) and media are named by their label / heading first, since their own text
 * is the content of every slide, or the fallback text of the player.
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

export type TextPreference = 'content' | 'label'

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

// text with no letter or digit, e.g. an icon font glyph or emoji (🗑, ×, ›), says little about the element
const LETTER_OR_DIGIT_RE = ((): RegExp => {
  try {
    return new RegExp('[\\p{L}\\p{N}]', 'u')
  } catch {
    // browsers without unicode property escapes: common scripts, excluding symbols and surrogate pairs (emoji)
    return /[0-9A-Za-z\u00C0-\u024F\u0370-\u1FFF\u3040-\u9FFF\uAC00-\uD7AF]/
  }
})()

const isMeaningful = (text: string): boolean => LETTER_OR_DIGIT_RE.test(text)

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

// a <label> that belongs to another field doesn't describe this element
const isForeignLabel = (candidate: Element, el: Element): boolean => {
  if (candidate.tagName.toUpperCase() !== 'LABEL') return false
  const control = (candidate as HTMLLabelElement).control
  return !!control && control !== el
}

function usableText(
  candidate: Element,
  el: Element,
  opts: TextOptions
): string {
  if (
    candidate === el ||
    candidate.contains(el) ||
    el.contains(candidate) ||
    isHidden(candidate) ||
    matches(candidate, opts.maskSelector) ||
    isForeignLabel(candidate, el)
  ) {
    return ''
  }
  const text = visibleText(candidate, opts)
  return isMeaningful(text) ? text : ''
}

/**
 * Finds the closest meaningful text around an element that has no label of its own,
 * e.g. an icon-only "delete" button inside a card titled "Invoice #42".
 * With `headingsFirst`, a heading / caption of the surrounding section wins over sibling text.
 */
function nearbyText(
  el: Element,
  opts: TextOptions,
  headingsFirst: boolean
): string {
  let current: Element | null = el
  for (let depth = 0; current && depth < opts.nearbyTextDepth; depth++) {
    const parent: Element | null = current.parentElement
    const atRoot = !parent || parent === el.ownerDocument.body

    const fromHeading = (): string => {
      if (atRoot) return ''
      for (const heading of Array.from(
        parent!.querySelectorAll(NEARBY_LABEL_SELECTOR)
      )) {
        const text = usableText(heading, el, opts)
        if (text) return text
      }
      return ''
    }
    // previous siblings are usually what a user reads right before the element
    const fromSiblings = (): string => {
      for (
        let sibling = current!.previousElementSibling;
        sibling;
        sibling = sibling.previousElementSibling
      ) {
        const text = usableText(sibling, el, opts)
        if (text) return text
      }
      return ''
    }

    const text = headingsFirst
      ? fromHeading() || fromSiblings()
      : fromSiblings() || fromHeading()
    if (text || atRoot) return text
    current = parent
  }
  return ''
}

/**
 * @param prefer `'label'` names containers (e.g. the carousel being swiped) by their label instead of their content.
 */
export function resolveText(
  el: Element,
  opts: TextOptions,
  prefer: TextPreference = 'content'
): ResolvedText {
  if (matches(el, opts.maskSelector) || closest(el, opts.maskSelector)) {
    return { text: '[masked]', source: 'masked' }
  }

  const media = isMedia(el)
  const labelFirst = prefer === 'label' || media
  const ownText: [TextSource, () => string] = [
    'text',
    () => (isFormField(el) || isForm(el) || media ? '' : visibleText(el, opts)),
  ]
  const accessibleName: [TextSource, () => string][] = [
    ['aria-label', () => attr(el, 'aria-label', opts)],
    ['aria-labelledby', () => labelledByText(el, opts)],
  ]

  const candidates: [TextSource, () => string][] = [
    ...(labelFirst
      ? [...accessibleName, ownText]
      : [ownText, ...accessibleName]),
    ['label', () => (isFormField(el) ? associatedLabelText(el, opts) : '')],
    ['value', () => (isButtonLikeInput(el) ? attr(el, 'value', opts) : '')],
    ['title', () => attr(el, 'title', opts)],
    ['text', () => (isForm(el) ? formHeading(el, opts) : '')],
    ['alt', () => attr(el, 'alt', opts) || descendantAlt(el, opts)],
    ['title', () => svgTitle(el, opts)],
    ['placeholder', () => attr(el, 'placeholder', opts)],
    // a field's name ("country") beats the text of whatever field sits next to it
    ['name', () => (isFormField(el) ? attr(el, 'name', opts) : '')],
    ['nearby', () => nearbyText(el, opts, labelFirst)],
    ['name', () => attr(el, 'name', opts)],
  ]

  // symbol-only text (icons, emoji) is kept only when nothing better is found
  let fallback: ResolvedText | undefined
  for (const [source, get] of candidates) {
    const text = get()
    if (!text) continue
    if (isMeaningful(text)) return { text, source }
    fallback = fallback ?? { text, source }
  }
  return fallback ?? { text: '', source: 'text' }
}
