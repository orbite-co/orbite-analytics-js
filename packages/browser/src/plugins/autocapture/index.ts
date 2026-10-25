import type { Plugin } from '../../core/plugin'
import type { Analytics } from '../../core/analytics'
import { cssPath, stableClasses } from './selector'
import {
  closest,
  matches,
  normalizeText,
  resolveText,
  TextOptions,
  TextSource,
} from './text'

/**
 * Groups of DOM interactions that can be turned on / off with the `events` setting.
 */
export type AutocaptureEventType =
  | 'click'
  | 'submit'
  | 'change'
  | 'scroll'
  | 'video'
  | 'swipe'

/**
 * The interaction behind a single tracked event, used as the key of `eventNames`.
 */
export type AutocaptureInteraction =
  | 'click'
  | 'submit'
  | 'change'
  | 'scroll'
  | 'swipe'
  | 'video_start'
  | 'video_progress'
  | 'video_complete'

export type InputMethod = 'mouse' | 'touch' | 'pen' | 'keyboard'

export type SwipeDirection = 'left' | 'right' | 'up' | 'down'

export interface AutocaptureSettings {
  /**
   * Which DOM interactions to capture.
   * @default ['click', 'submit', 'change', 'scroll', 'video', 'swipe']
   */
  events?: AutocaptureEventType[]
  /**
   * Track event name for each interaction, or a function to build one from the captured properties
   * (e.g. `(interaction, props) => \`Clicked "${props.target_text}"\``).
   * @default
   * {
   *   click: 'Element Clicked', submit: 'Form Submitted', change: 'Element Changed',
   *   scroll: 'Page Scrolled', swipe: 'Element Swiped',
   *   video_start: 'Video Started', video_progress: 'Video Progress', video_complete: 'Video Completed',
   * }
   */
  eventNames?:
    | Partial<Record<AutocaptureInteraction, string>>
    | ((
        interaction: AutocaptureInteraction,
        properties: AutocaptureProperties
      ) => string)
  /**
   * Capture clicks on any element, not only interactive ones (links, buttons, inputs, [role=button], ...).
   * @default false
   */
  captureAllClicks?: boolean
  /**
   * Extra selector that should be treated as clickable, on top of the built-in interactive elements.
   * @example '.card, [data-clickable]'
   */
  clickableSelector?: string
  /**
   * Elements (and their children) matching this selector are never captured.
   * `[data-autocapture-ignore]` is always ignored.
   */
  ignoreSelector?: string
  /**
   * Text inside elements matching this selector is replaced by `[masked]`.
   * `[data-autocapture-mask]` is always masked.
   */
  maskSelector?: string
  /**
   * Capture values of changed form fields. Passwords, hidden fields and fields with autocomplete
   * hints for payment / credentials are never captured.
   * @default false
   */
  captureInputValues?: boolean
  /**
   * Page scroll depths (in % of the page seen) that trigger a `scroll` event, once per page.
   * @default [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
   */
  scrollThresholds?: number[]
  /**
   * Video playback progress (in % of the duration) that triggers a `video_progress` event, once per playback.
   * Reaching the end is tracked separately as `video_complete`.
   * @default [10, 20, 30, 40, 50, 60, 70, 80, 90]
   */
  videoThresholds?: number[]
  /**
   * Swipe directions to capture. Vertical swipes mostly scroll the page, which `scroll` already covers.
   * @default ['left', 'right']
   */
  swipeDirections?: SwipeDirection[]
  /**
   * Minimum distance in px for a touch gesture to count as a swipe.
   * @default 50
   */
  minSwipeDistance?: number
  /**
   * Max length of the captured text.
   * @default 255
   */
  maxTextLength?: number
  /**
   * How many ancestors to walk when looking for "close text" for elements without a label of their own.
   * @default 3
   */
  nearbyTextDepth?: number
  /**
   * Max number of levels in the `selector` property.
   * @default 8
   */
  maxSelectorDepth?: number
  /**
   * Hook to change or drop (by returning `false`) an event before it is tracked.
   * For `scroll` events, `element` is `document.documentElement`.
   */
  beforeCapture?: (
    properties: AutocaptureProperties,
    element: Element,
    event: Event
  ) => AutocaptureProperties | false | void
}

export interface AutocaptureProperties {
  autocapture: true
  interaction: AutocaptureInteraction
  target_text?: string
  text_source?: TextSource
  tag_name?: string
  selector?: string
  id?: string
  classes?: string[]
  href?: string
  name?: string
  type?: string
  role?: string
  form_id?: string
  form_name?: string
  attributes?: Record<string, string>
  // click
  input_method?: InputMethod
  // change
  checked?: boolean
  value?: string
  // scroll
  scroll_depth?: number
  page_height?: number
  viewport_height?: number
  // video
  video_percent?: number
  video_position?: number
  video_duration?: number
  video_src?: string
  video_muted?: boolean
  video_autoplay?: boolean
  // swipe
  swipe_direction?: SwipeDirection
  swipe_distance?: number
  swipe_duration?: number
  [key: string]: unknown
}

const ALL_EVENTS: AutocaptureEventType[] = [
  'click',
  'submit',
  'change',
  'scroll',
  'video',
  'swipe',
]

const DEFAULT_EVENT_NAMES: Record<AutocaptureInteraction, string> = {
  click: 'Element Clicked',
  submit: 'Form Submitted',
  change: 'Element Changed',
  scroll: 'Page Scrolled',
  swipe: 'Element Swiped',
  video_start: 'Video Started',
  video_progress: 'Video Progress',
  video_complete: 'Video Completed',
}

const DECILES = [10, 20, 30, 40, 50, 60, 70, 80, 90]

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  'label',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="option"]',
  '[onclick]',
  '[data-autocapture]',
].join(',')

// elements a horizontal / vertical swipe is usually aimed at
const SWIPEABLE_SELECTOR =
  '[data-autocapture],[aria-roledescription="carousel"],[aria-roledescription="slide"],[role="tabpanel"],[role="listbox"]'

const ALWAYS_IGNORE = '[data-autocapture-ignore]'
const ALWAYS_MASK = '[data-autocapture-mask]'

const SENSITIVE_AUTOCOMPLETE_RE =
  /^(cc-|current-password|new-password|one-time-code)/
const SENSITIVE_NAME_RE =
  /(pass(word)?|pwd|secret|token|ssn|cpf|cvv|cvc|card.?num|credit.?card)/i

// data-* attributes are a common way of annotating elements for analytics, so keep a few of them
const MAX_DATA_ATTRIBUTES = 10
const MAX_ATTRIBUTE_LENGTH = 100

// ignore the synthetic click a <label> forwards to its control
const LABEL_FORWARD_WINDOW_MS = 100
// how long a pointerdown / touchstart is considered the origin of the following click
const POINTER_CLICK_WINDOW_MS = 1000
// slower gestures are drags / reading, not swipes
const MAX_SWIPE_DURATION_MS = 1000

const joinSelectors = (...selectors: (string | undefined)[]): string =>
  selectors.filter(Boolean).join(',')

const round = (n: number, digits = 0): number => {
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

function eventTarget(event: Event): Element | null {
  // composedPath() reaches into open shadow roots, event.target would be the shadow host
  const path = event.composedPath?.()
  const first = (path && path[0]) || event.target
  if (!first || !(first as Node).nodeType) return null
  const node = first as Node
  return node.nodeType === 1 ? (node as Element) : node.parentElement
}

function isSensitiveField(el: Element): boolean {
  const type = (el.getAttribute('type') ?? '').toLowerCase()
  const autocomplete = (el.getAttribute('autocomplete') ?? '').toLowerCase()
  return (
    type === 'password' ||
    type === 'hidden' ||
    SENSITIVE_AUTOCOMPLETE_RE.test(autocomplete) ||
    SENSITIVE_NAME_RE.test(el.getAttribute('name') ?? '') ||
    SENSITIVE_NAME_RE.test(el.id)
  )
}

function dataAttributes(el: Element): Record<string, string> | undefined {
  const attrs: Record<string, string> = {}
  let count = 0
  for (const { name, value } of Array.from(el.attributes)) {
    if (!name.startsWith('data-') || count >= MAX_DATA_ATTRIBUTES) continue
    attrs[name] = value.slice(0, MAX_ATTRIBUTE_LENGTH)
    count++
  }
  return count ? attrs : undefined
}

function stripUndefined<T extends object>(obj: T): T {
  Object.keys(obj).forEach((k) => {
    if ((obj as any)[k] === undefined) delete (obj as any)[k]
  })
  return obj
}

function isScrollable(el: Element, horizontal: boolean): boolean {
  const style = el.ownerDocument.defaultView?.getComputedStyle(el)
  const overflow = horizontal ? style?.overflowX : style?.overflowY
  if (overflow !== 'auto' && overflow !== 'scroll') return false
  return horizontal
    ? el.scrollWidth > el.clientWidth
    : el.scrollHeight > el.clientHeight
}

/**
 * Thresholds (sorted ascending) newly reached at `percent`, marking them as reached.
 */
function crossedThresholds(
  thresholds: number[],
  reached: Set<number>,
  percent: number
): number[] {
  const crossed = thresholds.filter((t) => t <= percent && !reached.has(t))
  crossed.forEach((t) => reached.add(t))
  return crossed
}

interface VideoState {
  src: string
  started: boolean
  completed: boolean
  reached: Set<number>
}

export function autocapture(settings: AutocaptureSettings = {}): Plugin {
  const events = settings.events ?? ALL_EVENTS
  const ignoreSelector = joinSelectors(ALWAYS_IGNORE, settings.ignoreSelector)
  const clickableSelector = joinSelectors(
    INTERACTIVE_SELECTOR,
    settings.clickableSelector
  )
  const textOptions: TextOptions = {
    maxTextLength: settings.maxTextLength ?? 255,
    nearbyTextDepth: settings.nearbyTextDepth ?? 3,
    maskSelector: joinSelectors(ALWAYS_MASK, settings.maskSelector),
    ignoreSelector,
  }
  const maxSelectorDepth = settings.maxSelectorDepth ?? 8
  const scrollThresholds = [
    ...(settings.scrollThresholds ?? [...DECILES, 100]),
  ].sort((a, b) => a - b)
  const videoThresholds = [...(settings.videoThresholds ?? DECILES)].sort(
    (a, b) => a - b
  )
  const swipeDirections = settings.swipeDirections ?? ['left', 'right']
  const minSwipeDistance = settings.minSwipeDistance ?? 50

  let loaded = false
  let analytics: Analytics | undefined
  let lastCaptured: { el: Element; at: number } | undefined
  let lastPointer: { method: InputMethod; at: number } | undefined
  let touchStart:
    | { x: number; y: number; at: number; target: Element }
    | undefined
  let scrollPage: string | undefined
  const scrollReached = new Set<number>()
  const videos = new WeakMap<HTMLVideoElement, VideoState>()
  const listeners: [
    EventTarget,
    string,
    EventListener,
    AddEventListenerOptions
  ][] = []

  const eventName = (
    interaction: AutocaptureInteraction,
    props: AutocaptureProperties
  ): string =>
    typeof settings.eventNames === 'function'
      ? settings.eventNames(interaction, props)
      : settings.eventNames?.[interaction] ?? DEFAULT_EVENT_NAMES[interaction]

  function describe(el: Element): Partial<AutocaptureProperties> {
    const { text, source } = resolveText(el, textOptions)
    const form = (el as HTMLInputElement).form ?? el.closest('form')
    const classes = stableClasses(el)
    return {
      target_text: text,
      text_source: source,
      tag_name: el.tagName.toLowerCase(),
      selector: cssPath(el, maxSelectorDepth),
      id: el.id || undefined,
      classes: classes.length ? classes : undefined,
      href:
        typeof (el as HTMLAnchorElement).href === 'string'
          ? (el as HTMLAnchorElement).href || undefined
          : undefined,
      name: el.getAttribute('name') ?? undefined,
      type: el.getAttribute('type') ?? undefined,
      role: el.getAttribute('role') ?? undefined,
      form_id: form?.id || undefined,
      form_name: form?.getAttribute('name') ?? undefined,
      attributes: dataAttributes(el),
    }
  }

  function send(
    interaction: AutocaptureInteraction,
    el: Element,
    event: Event,
    fields: Partial<AutocaptureProperties>
  ): void {
    if (!analytics) return
    let props = stripUndefined({
      autocapture: true,
      interaction,
      ...fields,
    } as AutocaptureProperties)
    if (settings.beforeCapture) {
      const result = settings.beforeCapture(props, el, event)
      if (result === false) return
      if (result) props = result
    }
    analytics.track(eventName(interaction, props), props).catch(() => {
      // never let tracking errors surface in the host page
    })
  }

  const capture = (
    interaction: AutocaptureInteraction,
    el: Element,
    event: Event,
    extra: Partial<AutocaptureProperties> = {}
  ): void => send(interaction, el, event, { ...describe(el), ...extra })

  const shouldIgnore = (el: Element): boolean => !!closest(el, ignoreSelector)

  // --- clicks / taps ---

  const onPointerDown = (event: Event): void => {
    const type = (event as PointerEvent).pointerType
    lastPointer = {
      method: type === 'touch' || type === 'pen' ? type : 'mouse',
      at: Date.now(),
    }
  }

  function inputMethod(event: Event): InputMethod {
    if (lastPointer && Date.now() - lastPointer.at < POINTER_CLICK_WINDOW_MS) {
      return lastPointer.method
    }
    // clicks fired from Enter / Space have no pointer and a click count of 0
    return (event as MouseEvent).detail === 0 ? 'keyboard' : 'mouse'
  }

  const onClick = (event: Event): void => {
    const target = eventTarget(event)
    if (!target) return
    const el =
      closest(target, clickableSelector) ??
      (settings.captureAllClicks ? target : null)
    if (!el || shouldIgnore(el)) return

    const now = Date.now()
    if (
      lastCaptured &&
      now - lastCaptured.at < LABEL_FORWARD_WINDOW_MS &&
      (lastCaptured.el as HTMLLabelElement).control === el
    ) {
      return
    }
    lastCaptured = { el, at: now }
    capture('click', el, event, { input_method: inputMethod(event) })
    lastPointer = undefined
  }

  // --- forms ---

  const onSubmit = (event: Event): void => {
    const form = eventTarget(event)
    if (!form || shouldIgnore(form)) return
    const submitter =
      (event as SubmitEvent).submitter ??
      form.querySelector('[type="submit"], button:not([type])')
    capture('submit', form, event, {
      submitter_text: submitter
        ? resolveText(submitter, textOptions).text
        : undefined,
    })
  }

  const onChange = (event: Event): void => {
    const el = eventTarget(event)
    if (!el || shouldIgnore(el)) return
    const input = el as HTMLInputElement
    const type = (el.getAttribute('type') ?? '').toLowerCase()
    const extra: Partial<AutocaptureProperties> = {}

    if (type === 'checkbox' || type === 'radio') {
      extra.checked = input.checked
    }
    if (
      settings.captureInputValues &&
      !isSensitiveField(el) &&
      !closest(el, textOptions.maskSelector)
    ) {
      const select = el as HTMLSelectElement
      extra.value =
        el.tagName.toUpperCase() === 'SELECT' && select.selectedOptions?.[0]
          ? normalizeText(
              select.selectedOptions[0].text,
              textOptions.maxTextLength
            )
          : normalizeText(input.value ?? '', textOptions.maxTextLength)
    }
    capture('change', el, event, extra)
  }

  // --- scroll depth ---

  const onScroll = (event: Event): void => {
    const doc = document.documentElement
    // single page apps keep the same document, so reset depth when the url changes
    const page = location.pathname + location.search
    if (page !== scrollPage) {
      scrollPage = page
      scrollReached.clear()
    }
    const pageHeight = Math.max(doc.scrollHeight, document.body?.scrollHeight)
    const viewportHeight = window.innerHeight
    if (!pageHeight || pageHeight <= viewportHeight) return

    const scrollTop = window.scrollY ?? doc.scrollTop
    const percent = Math.min(
      100,
      ((scrollTop + viewportHeight) / pageHeight) * 100
    )
    crossedThresholds(scrollThresholds, scrollReached, percent).forEach(
      (depth) =>
        send('scroll', doc, event, {
          scroll_depth: depth,
          page_height: Math.round(pageHeight),
          viewport_height: Math.round(viewportHeight),
        })
    )
  }

  // --- video ---

  function videoState(video: HTMLVideoElement): VideoState {
    const src = video.currentSrc || video.src
    let state = videos.get(video)
    if (!state || state.src !== src) {
      state = { src, started: false, completed: false, reached: new Set() }
      videos.set(video, state)
    }
    return state
  }

  function videoFields(
    video: HTMLVideoElement,
    percent: number
  ): Partial<AutocaptureProperties> {
    return {
      ...describe(video),
      video_percent: percent,
      video_position: round(video.currentTime, 1),
      video_duration: isFinite(video.duration)
        ? round(video.duration, 1)
        : undefined,
      video_src: video.currentSrc || video.src || undefined,
      video_muted: video.muted,
      video_autoplay: video.autoplay,
    }
  }

  const asVideo = (event: Event): HTMLVideoElement | null => {
    const el = eventTarget(event)
    return el && el.tagName.toUpperCase() === 'VIDEO' && !shouldIgnore(el)
      ? (el as HTMLVideoElement)
      : null
  }

  const onVideoPlay = (event: Event): void => {
    const video = asVideo(event)
    if (!video) return
    let state = videoState(video)
    if (state.completed) {
      // watching again after the end is a new playback
      videos.delete(video)
      state = videoState(video)
    }
    if (state.started) return
    state.started = true
    send('video_start', video, event, videoFields(video, 0))
  }

  const onVideoTimeUpdate = (event: Event): void => {
    const video = asVideo(event)
    if (!video || !isFinite(video.duration) || video.duration <= 0) return
    const state = videoState(video)
    if (!state.started || state.completed) return
    const percent = (video.currentTime / video.duration) * 100
    crossedThresholds(videoThresholds, state.reached, percent).forEach((p) =>
      send('video_progress', video, event, videoFields(video, p))
    )
  }

  const onVideoEnded = (event: Event): void => {
    const video = asVideo(event)
    if (!video) return
    const state = videoState(video)
    if (state.completed) return
    // timeupdate can skip the last thresholds on short videos
    crossedThresholds(videoThresholds, state.reached, 100).forEach((p) =>
      send('video_progress', video, event, videoFields(video, p))
    )
    state.completed = true
    send('video_complete', video, event, videoFields(video, 100))
  }

  // --- swipes ---

  const onTouchStart = (event: Event): void => {
    lastPointer = { method: 'touch', at: Date.now() }
    const touches = (event as TouchEvent).touches
    const target = eventTarget(event)
    touchStart =
      touches?.length === 1 && target
        ? {
            x: touches[0].clientX,
            y: touches[0].clientY,
            at: Date.now(),
            target,
          }
        : undefined // pinch / multi-finger gestures are not swipes
  }

  function swipeTarget(target: Element, horizontal: boolean): Element {
    let current: Element | null = target
    while (current && current !== document.body) {
      if (
        matches(current, SWIPEABLE_SELECTOR) ||
        isScrollable(current, horizontal)
      ) {
        return current
      }
      current = current.parentElement
    }
    return closest(target, clickableSelector) ?? target
  }

  const onTouchEnd = (event: Event): void => {
    const start = touchStart
    touchStart = undefined
    const touch = (event as TouchEvent).changedTouches?.[0]
    if (!start || !touch) return

    const duration = Date.now() - start.at
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const distance = Math.max(Math.abs(dx), Math.abs(dy))
    if (distance < minSwipeDistance || duration > MAX_SWIPE_DURATION_MS) return

    const direction: SwipeDirection = horizontal
      ? dx < 0
        ? 'left'
        : 'right'
      : dy < 0
      ? 'up'
      : 'down'
    if (!swipeDirections.includes(direction)) return

    const el = swipeTarget(start.target, horizontal)
    if (shouldIgnore(el)) return
    capture('swipe', el, event, {
      swipe_direction: direction,
      swipe_distance: Math.round(distance),
      swipe_duration: duration,
    })
  }

  const onTouchCancel = (): void => {
    touchStart = undefined
  }

  // capture phase on document: handlers calling stopPropagation() don't hide interactions,
  // and non-bubbling media events still reach us
  const capturing = { capture: true }
  const passive = { capture: true, passive: true }
  // built lazily: document / window don't exist when the plugin is created during SSR
  const domListeners = (): Record<
    AutocaptureEventType,
    [EventTarget, string, EventListener, AddEventListenerOptions][]
  > => ({
    click: [
      [document, 'pointerdown', onPointerDown, passive],
      [document, 'touchstart', onPointerDown, passive],
      [document, 'click', onClick, capturing],
    ],
    submit: [[document, 'submit', onSubmit, capturing]],
    change: [[document, 'change', onChange, capturing]],
    scroll: [[window, 'scroll', onScroll, { passive: true }]],
    video: [
      [document, 'play', onVideoPlay, capturing],
      [document, 'timeupdate', onVideoTimeUpdate, capturing],
      [document, 'ended', onVideoEnded, capturing],
    ],
    swipe: [
      [document, 'touchstart', onTouchStart, passive],
      [document, 'touchend', onTouchEnd, passive],
      [document, 'touchcancel', onTouchCancel, passive],
    ],
  })

  return {
    name: 'Autocapture',
    type: 'utility',
    version: '1.1.0',
    isLoaded: () => loaded,
    load: (_ctx, instance) => {
      if (typeof document === 'undefined') return Promise.resolve()
      analytics = instance
      const byType = domListeners()
      events.forEach((type) => {
        ;(byType[type] ?? []).forEach(([target, name, fn, options]) => {
          const handler: EventListener = (event) => {
            try {
              fn(event)
            } catch (e) {
              // autocapture must never break the host page
            }
          }
          target.addEventListener(name, handler, options)
          listeners.push([target, name, handler, options])
        })
      })
      loaded = true
      return Promise.resolve()
    },
    unload: () => {
      listeners.forEach(([target, name, handler, options]) =>
        target.removeEventListener(name, handler, options)
      )
      listeners.length = 0
      analytics = undefined
      loaded = false
    },
  }
}

export { resolveText } from './text'
export { cssPath } from './selector'
