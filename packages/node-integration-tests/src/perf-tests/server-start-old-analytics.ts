import Analytics from 'analytics-node'
import { startServer } from '../server/server'
import { trackEventSmall } from '../server/fixtures'

startServer()
  .then((app) => {
    const analytics = new Analytics('foo', {
      // legacy baseline SDK defaults to Segment's API; point it at the mocked Orbite host
      host: 'https://cdp.orbite.co',
      flushInterval: 1000,
      flushAt: 15,
    })
    app.get('/', (_, res) => {
      analytics.track(trackEventSmall)
      res.sendStatus(200)
    })
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
