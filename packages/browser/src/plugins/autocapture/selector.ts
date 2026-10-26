const MAX_CLASSES = 3
// skip generated class names (css-modules / css-in-js hashes) which are unstable across deploys
const STABLE_CLASS_RE = /^[a-zA-Z][\w-]{0,39}$/
// e.g. `css-1x2y3z`, `Button_root__a8f3k`, `sc-bdVaJa` style suffixes that contain a digit
const HASHED_CLASS_RE = /(?:^css-|^sc-|[_-](?=[a-zA-Z]*\d)[a-zA-Z0-9]{5,}$)/

export function stableClasses(el: Element): string[] {
  return Array.from(el.classList).filter(
    (c) => STABLE_CLASS_RE.test(c) && !HASHED_CLASS_RE.test(c)
  )
}

const escape = (value: string): string =>
  typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(value)
    : value.replace(/([^\w-])/g, '\\$1')

function segment(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (el.id) return `${tag}#${escape(el.id)}`

  let seg =
    tag +
    stableClasses(el)
      .slice(0, MAX_CLASSES)
      .map((c) => `.${escape(c)}`)
      .join('')

  const parent = el.parentElement
  if (parent) {
    const sameTag = Array.from(parent.children).filter(
      (c) => c.tagName === el.tagName
    )
    if (sameTag.length > 1) {
      seg += `:nth-of-type(${sameTag.indexOf(el) + 1})`
    }
  }
  return seg
}

/**
 * Builds a CSS selector path from the element up to the closest ancestor with an id (or `maxDepth` levels),
 * e.g. `div#app > form.signup > button.btn:nth-of-type(2)`.
 */
export function cssPath(el: Element, maxDepth: number): string {
  const segments: string[] = []
  let current: Element | null = el
  while (current && segments.length < maxDepth) {
    const tag = current.tagName.toLowerCase()
    if (tag === 'html' || tag === 'body') break
    segments.unshift(segment(current))
    if (current.id) break
    current = current.parentElement
  }
  return segments.join(' > ')
}
