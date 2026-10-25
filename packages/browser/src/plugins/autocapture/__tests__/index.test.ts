import { autocapture, AutocaptureSettings } from '..'
import { cssPath } from '../selector'
import { Plugin } from '../../../core/plugin'

const track = jest.fn().mockResolvedValue(undefined)
const analytics = { track } as any

let plugin: Plugin

async function setup(html: string, settings?: AutocaptureSettings) {
  document.body.innerHTML = html
  plugin = autocapture(settings)
  await plugin.load({} as any, analytics)
}

const lastCall = () => track.mock.calls[track.mock.calls.length - 1]
const click = (selector: string) =>
  (document.querySelector(selector) as HTMLElement).click()

afterEach(async () => {
  await plugin?.unload?.({} as any, analytics)
  track.mockClear()
  document.body.innerHTML = ''
})

describe('autocapture plugin', () => {
  it('loads as a utility plugin', async () => {
    await setup('')
    expect(plugin.type).toBe('utility')
    expect(plugin.isLoaded()).toBe(true)
  })

  describe('clicks', () => {
    it('captures button text and element metadata', async () => {
      await setup(
        `<div id="app"><form id="signup" name="signup"><button class="btn btn-primary css-1x2y3z" data-plan="pro" type="button">  Sign   up <span>now</span></button></form></div>`
      )
      click('button')
      expect(track).toHaveBeenCalledTimes(1)
      const [name, props] = lastCall()
      expect(name).toBe('Element Clicked')
      expect(props).toMatchObject({
        autocapture: true,
        interaction: 'click',
        target_text: 'Sign up now',
        text_source: 'text',
        tag_name: 'button',
        classes: ['btn', 'btn-primary'],
        type: 'button',
        form_id: 'signup',
        form_name: 'signup',
        attributes: { 'data-plan': 'pro' },
        selector: 'form#signup > button.btn.btn-primary',
      })
    })

    it('resolves the interactive ancestor of the clicked node', async () => {
      await setup(`<a href="/pricing"><span><b>See pricing</b></span></a>`)
      click('b')
      const [, props] = lastCall()
      expect(props.tag_name).toBe('a')
      expect(props.target_text).toBe('See pricing')
      expect(props.href).toBe('http://localhost/pricing')
    })

    it('ignores clicks on non-interactive elements by default', async () => {
      await setup(`<p>just text</p>`)
      click('p')
      expect(track).not.toHaveBeenCalled()
    })

    it('captures any element when captureAllClicks is on', async () => {
      await setup(`<p>just text</p>`, { captureAllClicks: true })
      click('p')
      expect(lastCall()[1].target_text).toBe('just text')
    })

    it('supports a custom clickable selector', async () => {
      await setup(`<div class="card"><h3>Plan A</h3></div>`, {
        clickableSelector: '.card',
      })
      click('h3')
      expect(lastCall()[1]).toMatchObject({
        tag_name: 'div',
        target_text: 'Plan A',
      })
    })

    it.each([
      [
        `<button aria-label="Close dialog"><svg></svg></button>`,
        'Close dialog',
        'aria-label',
      ],
      [
        `<span id="l">Delete item</span><button aria-labelledby="l"></button>`,
        'Delete item',
        'aria-labelledby',
      ],
      [
        `<button title="Settings"><i class="icon"></i></button>`,
        'Settings',
        'title',
      ],
      [
        `<a href="/"><img alt="Orbite home" src="x.png"></a>`,
        'Orbite home',
        'alt',
      ],
      [`<input type="submit" value="Send">`, 'Send', 'value'],
      [`<button><svg><title>Search</title></svg></button>`, 'Search', 'title'],
    ])('falls back to accessible names: %s', async (html, text, source) => {
      await setup(html)
      click('button, a, input')
      expect(lastCall()[1]).toMatchObject({
        target_text: text,
        text_source: source,
      })
    })

    it('uses close text for icon-only elements', async () => {
      await setup(`
        <div class="card">
          <h3>Invoice #42</h3>
          <div class="actions"><button class="icon"><i></i></button></div>
        </div>`)
      click('button')
      expect(lastCall()[1]).toMatchObject({
        target_text: 'Invoice #42',
        text_source: 'nearby',
      })
    })

    it('prefers the previous sibling text as close text', async () => {
      await setup(
        `<div><span>Notifications</span><button role="switch"></button></div>`
      )
      click('button')
      expect(lastCall()[1].target_text).toBe('Notifications')
    })

    it('skips hidden, script and aria-hidden text', async () => {
      await setup(
        `<button>Buy<span hidden>secret</span><span aria-hidden="true">★</span><script>x()</script></button>`
      )
      click('button')
      expect(lastCall()[1].target_text).toBe('Buy')
    })

    it('truncates long text', async () => {
      await setup(`<button>${'a'.repeat(50)}</button>`, { maxTextLength: 10 })
      click('button')
      expect(lastCall()[1].target_text).toBe('aaaaaaaaa…')
    })

    it('redacts emails and card numbers from text', async () => {
      await setup(`<button>Pay 4111 1111 1111 1111 as jane@doe.com</button>`)
      click('button')
      expect(lastCall()[1].target_text).toBe('Pay [redacted] as [email]')
    })

    it('masks text with data-autocapture-mask and maskSelector', async () => {
      await setup(
        `<button data-autocapture-mask>John Doe</button><a href="#" class="pii">Acct</a>`,
        { maskSelector: '.pii' }
      )
      click('button')
      expect(lastCall()[1].target_text).toBe('[masked]')
      click('a')
      expect(lastCall()[1].target_text).toBe('[masked]')
    })

    it('ignores elements under data-autocapture-ignore and ignoreSelector', async () => {
      await setup(
        `<div data-autocapture-ignore><button id="a">A</button></div><nav class="skip"><a id="b" href="#">B</a></nav>`,
        { ignoreSelector: '.skip' }
      )
      click('#a')
      click('#b')
      expect(track).not.toHaveBeenCalled()
    })

    it('captures clicks even when propagation is stopped', async () => {
      await setup(`<button>Stop</button>`)
      document
        .querySelector('button')!
        .addEventListener('click', (e) => e.stopPropagation())
      click('button')
      expect(track).toHaveBeenCalledTimes(1)
    })

    it('does not double count the click a label forwards to its input', async () => {
      await setup(
        `<label for="tos">Accept terms</label><input id="tos" type="checkbox">`,
        {
          events: ['click'],
        }
      )
      click('label')
      expect(track).toHaveBeenCalledTimes(1)
      expect(lastCall()[1]).toMatchObject({
        tag_name: 'label',
        target_text: 'Accept terms',
      })
    })

    it('supports custom event names', async () => {
      await setup(`<button>Save</button>`, {
        eventNames: (type, props) => `${type}: ${props.target_text}`,
      })
      click('button')
      expect(lastCall()[0]).toBe('click: Save')
    })

    it('lets beforeCapture enrich or drop events', async () => {
      await setup(`<button>Keep</button><button id="drop">Drop</button>`, {
        beforeCapture: (props) =>
          props.target_text === 'Drop' ? false : { ...props, extra: 1 },
      })
      click('#drop')
      expect(track).not.toHaveBeenCalled()
      click('button')
      expect(lastCall()[1].extra).toBe(1)
    })

    it('never throws into the host page', async () => {
      await setup(`<button>Boom</button>`, {
        beforeCapture: () => {
          throw new Error('boom')
        },
      })
      expect(() => click('button')).not.toThrow()
    })
  })

  describe('forms', () => {
    it('captures submissions with the submitter text', async () => {
      await setup(
        `<form id="checkout" aria-label="Checkout"><input name="email"><button type="submit">Pay now</button></form>`
      )
      const form = document.querySelector('form')!
      form.addEventListener('submit', (e) => e.preventDefault())
      form.requestSubmit(document.querySelector('button'))
      const submit = track.mock.calls.find(([n]) => n === 'Form Submitted')
      expect(submit?.[1]).toMatchObject({
        interaction: 'submit',
        tag_name: 'form',
        form_id: 'checkout',
        target_text: 'Checkout',
        submitter_text: 'Pay now',
      })
    })

    it('names forms by their heading rather than all their text', async () => {
      await setup(
        `<form><h2>Create account</h2><label>Email <input name="email"></label><button>Go</button></form>`
      )
      const form = document.querySelector('form')!
      form.addEventListener('submit', (e) => e.preventDefault())
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
      expect(lastCall()[1]).toMatchObject({
        target_text: 'Create account',
        submitter_text: 'Go',
      })
    })

    it('captures field changes labelled by their <label>, without values', async () => {
      await setup(
        `<label for="e">Work email</label><input id="e" name="email" type="email">`
      )
      const input = document.querySelector('input')!
      input.value = 'jane@doe.com'
      input.dispatchEvent(new Event('change', { bubbles: true }))
      const [name, props] = lastCall()
      expect(name).toBe('Element Changed')
      expect(props).toMatchObject({
        target_text: 'Work email',
        text_source: 'label',
      })
      expect(props.value).toBeUndefined()
    })

    it('captures checked state and wrapping labels', async () => {
      await setup(
        `<label><input type="checkbox" name="news"> Newsletter</label>`
      )
      const input = document.querySelector('input')!
      input.checked = true
      input.dispatchEvent(new Event('change', { bubbles: true }))
      expect(lastCall()[1]).toMatchObject({
        target_text: 'Newsletter',
        checked: true,
      })
    })

    it('captures values only when enabled and never for sensitive fields', async () => {
      await setup(
        `<select name="country"><option value="br">Brazil</option><option value="us" selected>United States</option></select>
         <input type="password" name="pw"><input name="card_number" autocomplete="cc-number">`,
        { captureInputValues: true }
      )
      const fire = (sel: string, value?: string) => {
        const el = document.querySelector(sel) as HTMLInputElement
        if (value !== undefined) el.value = value
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return lastCall()[1]
      }
      expect(fire('select').value).toBe('United States')
      expect(fire('[type=password]', 'hunter2').value).toBeUndefined()
      expect(fire('[name=card_number]', '4111').value).toBeUndefined()
    })
  })

  describe('input method', () => {
    const pointer = (selector: string, pointerType: string) => {
      const ev = new Event('pointerdown', { bubbles: true })
      Object.defineProperty(ev, 'pointerType', { value: pointerType })
      document.querySelector(selector)!.dispatchEvent(ev)
    }
    const mouseClick = (selector: string, detail: number) =>
      document
        .querySelector(selector)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, detail }))

    it('marks taps as touch', async () => {
      await setup(`<button>Tap me</button>`)
      pointer('button', 'touch')
      mouseClick('button', 1)
      expect(lastCall()[1]).toMatchObject({
        interaction: 'click',
        input_method: 'touch',
      })
    })

    it('distinguishes mouse, pen and keyboard', async () => {
      await setup(`<button>Go</button>`)
      mouseClick('button', 1)
      expect(lastCall()[1].input_method).toBe('mouse')
      pointer('button', 'pen')
      mouseClick('button', 1)
      expect(lastCall()[1].input_method).toBe('pen')
      mouseClick('button', 0)
      expect(lastCall()[1].input_method).toBe('keyboard')
    })
  })

  describe('scroll depth', () => {
    const scrollTo = (y: number) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
      window.dispatchEvent(new Event('scroll'))
    }
    const setPageHeight = (h: number) =>
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        value: h,
        configurable: true,
      })

    beforeEach(() => {
      Object.defineProperty(window, 'innerHeight', {
        value: 500,
        configurable: true,
      })
    })
    afterEach(() => {
      setPageHeight(0)
      history.replaceState(null, '', '/')
    })

    it('tracks each decile once per page', async () => {
      await setup(`<main></main>`)
      setPageHeight(2000)
      scrollTo(500) // (500 + 500) / 2000 = 50%
      expect(track.mock.calls.map(([, p]) => p.scroll_depth)).toEqual([
        10, 20, 30, 40, 50,
      ])
      expect(lastCall()).toEqual([
        'Page Scrolled',
        {
          autocapture: true,
          interaction: 'scroll',
          scroll_depth: 50,
          page_height: 2000,
          viewport_height: 500,
        },
      ])

      track.mockClear()
      scrollTo(0)
      scrollTo(500)
      expect(track).not.toHaveBeenCalled()
      scrollTo(1500)
      expect(track.mock.calls.map(([, p]) => p.scroll_depth)).toEqual([
        60, 70, 80, 90, 100,
      ])
    })

    it('starts over when a single page app changes url', async () => {
      await setup(`<main></main>`)
      setPageHeight(2000)
      scrollTo(100) // 30%
      history.pushState(null, '', '/next')
      track.mockClear()
      scrollTo(100)
      expect(track).toHaveBeenCalledTimes(3)
    })

    it('ignores pages that fit in the viewport', async () => {
      await setup(`<main></main>`)
      setPageHeight(400)
      scrollTo(0)
      expect(track).not.toHaveBeenCalled()
    })

    it('supports custom thresholds', async () => {
      await setup(`<main></main>`, { scrollThresholds: [100, 25] })
      setPageHeight(1000)
      scrollTo(500)
      expect(track.mock.calls.map(([, p]) => p.scroll_depth)).toEqual([25, 100])
    })
  })

  describe('video', () => {
    let video: HTMLVideoElement
    const fire = (type: string, currentTime?: number) => {
      if (currentTime !== undefined) {
        Object.defineProperty(video, 'currentTime', {
          value: currentTime,
          configurable: true,
        })
      }
      video.dispatchEvent(new Event(type)) // media events don't bubble
    }
    const setupVideo = async (
      duration: number,
      settings?: AutocaptureSettings
    ) => {
      await setup(
        `<section><h2>Product tour</h2><video src="/tour.mp4">Your browser does not support video</video></section>`,
        settings
      )
      video = document.querySelector('video')!
      Object.defineProperty(video, 'duration', { value: duration })
      video.muted = true
    }
    const interactions = () =>
      track.mock.calls.map(([name, p]) => `${name}:${p.video_percent}`)

    it('tracks start, deciles and completion with close text', async () => {
      await setupVideo(100)
      fire('play', 0)
      fire('timeupdate', 25)
      fire('timeupdate', 26)
      expect(interactions()).toEqual([
        'Video Started:0',
        'Video Progress:10',
        'Video Progress:20',
      ])
      expect(track.mock.calls[0][1]).toMatchObject({
        interaction: 'video_start',
        target_text: 'Product tour',
        text_source: 'nearby',
        tag_name: 'video',
        video_src: 'http://localhost/tour.mp4',
        video_duration: 100,
        video_muted: true,
      })

      track.mockClear()
      fire('pause')
      fire('play', 26) // resuming isn't a new start
      fire('timeupdate', 95)
      fire('ended', 100)
      expect(interactions()).toEqual([
        'Video Progress:30',
        'Video Progress:40',
        'Video Progress:50',
        'Video Progress:60',
        'Video Progress:70',
        'Video Progress:80',
        'Video Progress:90',
        'Video Completed:100',
      ])
    })

    it('treats replaying after the end as a new playback', async () => {
      await setupVideo(10, { videoThresholds: [50] })
      fire('play', 0)
      fire('ended', 10)
      track.mockClear()
      fire('play', 0)
      fire('timeupdate', 6)
      expect(interactions()).toEqual(['Video Started:0', 'Video Progress:50'])
    })

    it('only tracks the start of live streams', async () => {
      await setupVideo(Infinity)
      fire('play', 0)
      fire('timeupdate', 500)
      expect(interactions()).toEqual(['Video Started:0'])
      expect(lastCall()[1].video_duration).toBeUndefined()
    })

    it('skips ignored videos', async () => {
      await setupVideo(100)
      video.setAttribute('data-autocapture-ignore', '')
      fire('play', 0)
      expect(track).not.toHaveBeenCalled()
    })
  })

  describe('swipes', () => {
    const touch = (
      type: string,
      el: Element,
      points: [number, number][],
      list: 'touches' | 'changedTouches' = type === 'touchend'
        ? 'changedTouches'
        : 'touches'
    ) => {
      const ev = new Event(type, { bubbles: true })
      Object.defineProperty(ev, list, {
        value: points.map(([clientX, clientY]) => ({ clientX, clientY })),
      })
      el.dispatchEvent(ev)
    }
    const swipe = (
      el: Element,
      from: [number, number],
      to: [number, number]
    ) => {
      touch('touchstart', el, [from])
      touch('touchend', el, [to])
    }
    const html = `<div class="carousel" aria-roledescription="carousel"><div class="slide"><h3>Running shoes</h3></div></div>`

    it('captures horizontal swipes on the carousel being swiped', async () => {
      await setup(html)
      swipe(document.querySelector('h3')!, [300, 100], [80, 120])
      const [name, props] = lastCall()
      expect(name).toBe('Element Swiped')
      expect(props).toMatchObject({
        interaction: 'swipe',
        swipe_direction: 'left',
        swipe_distance: 220,
        tag_name: 'div',
        classes: ['carousel'],
        target_text: 'Running shoes',
      })
      swipe(document.querySelector('h3')!, [80, 100], [300, 100])
      expect(lastCall()[1].swipe_direction).toBe('right')
    })

    it('ignores vertical swipes by default, unless enabled', async () => {
      await setup(html)
      swipe(document.querySelector('h3')!, [100, 400], [100, 100])
      expect(track).not.toHaveBeenCalled()

      await plugin.unload!({} as any, analytics)
      await setup(html, { swipeDirections: ['up'] })
      swipe(document.querySelector('h3')!, [100, 400], [100, 100])
      expect(lastCall()[1].swipe_direction).toBe('up')
    })

    it('ignores short moves and multi-finger gestures', async () => {
      await setup(html)
      const el = document.querySelector('h3')!
      swipe(el, [100, 100], [130, 100])
      touch('touchstart', el, [
        [100, 100],
        [200, 100],
      ])
      touch('touchend', el, [[400, 100]])
      expect(track).not.toHaveBeenCalled()
    })

    it('falls back to the touched interactive element', async () => {
      await setup(`<a href="/p/1"><span>Card</span></a>`)
      swipe(document.querySelector('span')!, [300, 100], [100, 100])
      expect(lastCall()[1]).toMatchObject({
        tag_name: 'a',
        target_text: 'Card',
      })
    })
  })

  it('stops capturing after unload', async () => {
    await setup(`<button>Bye</button>`)
    await plugin.unload!({} as any, analytics)
    click('button')
    expect(track).not.toHaveBeenCalled()
    expect(plugin.isLoaded()).toBe(false)
  })
})

describe('cssPath', () => {
  it('builds a path anchored at the closest id with nth-of-type for siblings', () => {
    document.body.innerHTML = `<main id="root"><ul class="list"><li>a</li><li class="item">b</li></ul></main>`
    expect(cssPath(document.querySelector('.item')!, 8)).toBe(
      'main#root > ul.list > li.item:nth-of-type(2)'
    )
  })

  it('respects max depth', () => {
    document.body.innerHTML = `<div><section><article><p>x</p></article></section></div>`
    expect(cssPath(document.querySelector('p')!, 2)).toBe('article > p')
  })
})
