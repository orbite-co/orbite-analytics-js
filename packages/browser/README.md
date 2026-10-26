# @orbite/analytics-js

Orbite analytics for user tracking and event logging in the browser.

### Table of Contents

- [🏎️ Quickstart](#-quickstart)
  - [💡 Using with Segment](#-using-with-segment)
  - [💻 Using as an `npm` package](#-using-as-an-npm-package)
- [🔌 Plugins](#-plugins)
- [🐒 Development](#-development)

---

# 🏎️ Quickstart

The easiest and quickest way to get started with Analytics 2.0 is to [use it through Segment](#-using-with-segment). Alternatively, you can [install it through NPM](#-using-as-an-npm-package) and do the instrumentation yourself.

## 💡 Using with Segment

1. Create a javascript source at [Segment](https://app.segment.com) - new sources will automatically be using Analytics 2.0! Segment will automatically generate a snippet that you can add to your website. For more information visit our [documentation](https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/)).

2. Start tracking!

## 💻 Using as an `npm` package

1. Install the package

```sh
# npm
npm install @orbite/analytics-js

# yarn
yarn add @orbite/analytics-js

# pnpm
pnpm add @orbite/analytics-js
```

2. Import the package into your project and you're good to go (with working types)!

```ts
import { AnalyticsBrowser } from '@orbite/analytics-js'

const analytics = AnalyticsBrowser.load({ writeKey: '<YOUR_WRITE_KEY>' })

analytics.identify('hello world')

document.body?.addEventListener('click', () => {
  analytics.track('document body clicked!')
})
```

## Lazy / Delayed Loading
You can load a buffered version of analytics that requires `.load` to be explicitly called before initiating any network activity. This can be useful if you want to wait for a user to consent before fetching any tracking destinations or sending buffered events to segment.

- ⚠️ ️`.load` should only be called _once_.

```ts
export const analytics = new AnalyticsBrowser()

analytics.identify("hello world")

if (userConsentsToBeingTracked) {
    analytics.load({ writeKey: '<YOUR_WRITE_KEY>' }) // destinations loaded, enqueued events are flushed
}
```
This strategy also comes in handy if you have some settings that are fetched asynchronously.
```ts
const analytics = new AnalyticsBrowser()
fetchWriteKey().then(writeKey => analytics.load({ writeKey }))

analytics.identify("hello world")
```
## Error Handling
### Handling initialization errors
Initialization errors get logged by default, but if you also want to catch these errors, you can do the following:
```ts
export const analytics = new AnalyticsBrowser();
analytics
  .load({ writeKey: "MY_WRITE_KEY" })
  .catch((err) => ...);
```

## Custom CDN / API Proxy
[Self Hosting or Proxying Analytics.js documentation](
 https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/custom-proxy/#custom-cdn--api-proxy)

## Examples / Usage in Common Frameworks and SPAs

### Next.js
- https://github.com/vercel/next.js/tree/canary/examples/with-segment-analytics
- https://github.com/vercel/next.js/tree/canary/examples/with-segment-analytics-pages-router

### Vanilla React
```tsx
import { AnalyticsBrowser } from '@orbite/analytics-js'

// We can export this instance to share with rest of our codebase.
export const analytics = AnalyticsBrowser.load({ writeKey: '<YOUR_WRITE_KEY>' })

const App = () => (
  <div>
    <button onClick={() => analytics.track('hello world')}>Track</button>
  </div>
)
```



### Vue

1. Export analytics instance.

```ts
import { AnalyticsBrowser } from '@orbite/analytics-js'

export const analytics = AnalyticsBrowser.load({
  writeKey: '<YOUR_WRITE_KEY>',
})
```

2. in `.vue` component

```tsx
<template>
  <button @click="track()">Track</button>
</template>

<script>
import { defineComponent } from 'vue'
import { analytics } from './services/segment'

export default defineComponent({
  setup() {
    function track() {
      analytics.track('Hello world')
    }

    return {
      track,
    }
  },
})
</script>
```

## Autocapture

Automatically track clicks and taps, form submissions, field changes, swipes, scroll depth and video progress, without instrumenting each element. Every element event is labelled with the closest readable text of the element (similar to Heap): its own text, then its accessible name (`aria-label`, `<label>`, `title`, `alt`, ...), then nearby text such as the heading of the card or section it sits in. Icon or emoji-only text is only used when nothing better is found, and carousels and videos are named by their label or heading rather than their content.

| Event              | `interaction`    | When                                                                                     | Extra properties                                                |
| ------------------ | ---------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `Element Clicked`  | `click`          | Click or tap on a link, button, field, ARIA widget, ...                                  | `input_method`: `mouse` \| `touch` \| `pen` \| `keyboard`        |
| `Form Submitted`   | `submit`         | A form is submitted                                                                      | `submitter_text`                                                |
| `Element Changed`  | `change`         | A field changes                                                                          | `checked`, `value` (opt-in)                                     |
| `Element Swiped`   | `swipe`          | A one-finger swipe ≥ 50px in under 1s, on the carousel / scroller / element being swiped | `swipe_direction`, `swipe_distance` (px), `swipe_duration` (ms), `swipe_item_text` (the slide swiped on) |
| `Page Scrolled`    | `scroll`         | The page is seen down to 10%, 20%, ... 100%, once each per page (SPA url changes reset)  | `scroll_depth`, `page_height`, `viewport_height`                |
| `Video Started`    | `video_start`    | A `<video>` starts playing                                                               | `video_percent`, `video_position`, `video_duration`, `video_src`, `video_muted`, `video_autoplay` |
| `Video Progress`   | `video_progress` | Playback reaches 10%, 20%, ... 90%, once each per playback                               | same as above                                                   |
| `Video Completed`  | `video_complete` | Playback ends (replaying after that counts as a new playback)                            | same as above                                                   |

```ts
import { AnalyticsBrowser } from '@orbite/analytics-js'

// npm: as an init option (lazy-loaded) ...
export const analytics = AnalyticsBrowser.load(
  { writeKey: '<YOUR_WRITE_KEY>' },
  { autocapture: true }
)

// ... or as a plugin
import { autocapture } from '@orbite/analytics-js'
AnalyticsBrowser.load({
  writeKey: '<YOUR_WRITE_KEY>',
  plugins: [autocapture({ ignoreSelector: '.no-track' })],
})
```

Snippet users can pass the same option: `analytics.load('<YOUR_WRITE_KEY>', { autocapture: true })`.

A click on `<button class="btn">Sign up</button>` sends:

```js
analytics.track('Element Clicked', {
  autocapture: true,
  interaction: 'click',
  target_text: 'Sign up',
  text_source: 'text', // text | aria-label | aria-labelledby | label | title | alt | value | placeholder | nearby | name | masked
  tag_name: 'button',
  selector: 'form#signup > button.btn',
  classes: ['btn'],
  // when present: id, href, name, type, role, form_id, form_name, attributes (data-*), checked, value, submitter_text
})
```

| Option               | Default                                                                                  | Description                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `events`             | `['click', 'submit', 'change', 'scroll', 'video', 'swipe']`                              | Interactions to capture.                                                                            |
| `eventNames`         | see the table above                                                                      | Event names keyed by `interaction`, or `(interaction, props) => string` (e.g. `` `Clicked "${props.target_text}"` ``). |
| `scrollThresholds`   | `[10, 20, ..., 100]`                                                                     | Scroll depths (% of the page seen) to track.                                                        |
| `videoThresholds`    | `[10, 20, ..., 90]`                                                                      | Video progress (% of the duration) to track.                                                        |
| `swipeDirections`    | `['left', 'right']`                                                                      | Swipe directions to track. Vertical swipes are mostly page scrolls, already covered by `scroll`.    |
| `minSwipeDistance`   | `50`                                                                                     | Minimum swipe length in px.                                                                         |
| `captureAllClicks`   | `false`                                                                                  | Capture clicks on any element, not only links, buttons, inputs and ARIA widgets.                    |
| `clickableSelector`  |                                                                                          | Extra selector treated as clickable, e.g. `'.card'`.                                                |
| `ignoreSelector`     |                                                                                          | Never capture these elements or their children. `[data-autocapture-ignore]` always applies.         |
| `maskSelector`       |                                                                                          | Replace the text of these elements with `[masked]`. `[data-autocapture-mask]` always applies.       |
| `captureInputValues` | `false`                                                                                  | Send field values on change. Password, hidden, payment and credential-like fields are never sent.   |
| `maxTextLength`      | `255`                                                                                    | Truncate captured text.                                                                             |
| `nearbyTextDepth`    | `3`                                                                                      | Ancestor levels searched for close text.                                                            |
| `maxSelectorDepth`   | `8`                                                                                      | Levels in the `selector` property.                                                                  |
| `beforeCapture`      |                                                                                          | `(props, element, event) => props \| false` to enrich or drop an event.                             |

Emails and card-number-like digit sequences in captured text are always redacted.

## Support for Web Workers (Experimental)
 While this package does not support web workers out of the box, there are options:

1. Run analytics.js in a web worker via [partytown.io](https://partytown.builder.io/). See [our partytown example](../../playgrounds/next-playground/pages/partytown). **Supports both cloud and device mode destinations, but not all device mode destinations may work.**

2. Try [@orbite/analytics-node](../node) with `flushAt: 1`, which should work in any runtime where `fetch` is available. **Warning: cloud destinations only!**




## How to add typescript support (snippet users only)

1. Install npm package `@orbite/analytics-js` as a dev dependency.

2. Create `./typings/analytics.d.ts`
```ts
// ./typings/analytics.d.ts
import type { AnalyticsSnippet } from "@orbite/analytics-js";

declare global {
  interface Window {
    analytics: AnalyticsSnippet;
  }
}

```
3. Configure typescript to read from the custom `./typings` folder
```jsonc
// tsconfig.json
{
  ...
  "compilerOptions": {
    ....
    "typeRoots": [
      "./node_modules/@types",
      "./typings"
    ]
  }
  ....
}
```


## 🐒 Development

First, clone the repo and then startup our local dev environment:

```sh
$ git clone git@github.com:orbite-co/orbite-analytics-js.git
$ cd analytics-next
$ nvm use  # installs correct version of node defined in .nvmrc.
$ yarn && yarn build
$ yarn test
$ yarn dev  # optional: runs analytics-next playground.
```

> If you get "Cannot find module '@orbite/analytics-js' or its corresponding type declarations.ts(2307)" (in VSCode), you may have to "cmd+shift+p -> "TypeScript: Restart TS server"

Then, make your changes and test them out in the test app!

<img src="https://user-images.githubusercontent.com/2866515/135407053-7561d522-b969-484d-8d3a-6f1c4d9c025b.gif" alt="Example of the development app" width="500px">

# 🔌 Plugins

When developing against Analytics Next you will likely be writing plugins, which can augment functionality and enrich data. Plugins are isolated chunks which you can build, test, version, and deploy independently of the rest of the codebase. Plugins are bounded by Analytics Next which handles things such as observability, retries, and error management.

Plugins can be of two different priorities:

1. **Critical**: Analytics Next should expect this plugin to be loaded before starting event delivery
2. **Non-critical**: Analytics Next can start event delivery before this plugin has finished loading

and can be of five different types:

1. **Before**: Plugins that need to be run before any other plugins are run. An example of this would be validating events before passing them along to other plugins.
2. **After**: Plugins that need to run after all other plugins have run. An example of this is the segment.io integration, which will wait for destinations to succeed or fail so that it can send its observability metrics.
3. **Destination**: Destinations to send the event to (ie. legacy destinations). Does not modify the event and failure does not halt execution.
4. **Enrichment**: Modifies an event, failure here could halt the event pipeline.
5. **Utility**: Plugins that change Analytics Next functionality and don't fall into the other categories.

Here is an example of a simple plugin that would convert all track events event names to lowercase before the event gets sent through the rest of the pipeline:

```ts
import type { Plugin } from '@orbite/analytics-js'

export const lowercase: Plugin = {
  name: 'Lowercase Event Name',
  type: 'before',
  version: '1.0.0',

  isLoaded: () => true,
  load: () => Promise.resolve(),

  track: (ctx) => {
    ctx.event.event = ctx.event.event.toLowerCase()
    return ctx
  }
}

analytics.register(lowercase)
```

For further examples check out our [existing plugins](/packages/browser/src/plugins).

## 🧪 QA
Feature work and bug fixes should include tests. Run all [Jest](https://jestjs.io) tests:
```
$ yarn test
```
Lint all with [ESLint](https://github.com/typescript-eslint/typescript-eslint/):
```
$ yarn lint
```



