// `vite preview` (what this used to run on Railway) is explicitly not meant
// for production use — among other things, it doesn't let us set different
// cache rules for index.html vs the hashed /assets files, which caused a
// real bug on the admin app: a browser kept its OLD cached index.html (from
// a previous deploy) after a new deploy replaced dist/ entirely, so it
// asked for a CSS file whose hash no longer existed — the request fell
// through to index.html (SPA-fallback for client-side routing) and the
// browser rejected text/html where it expected a stylesheet, so NO styles
// loaded at all. index.html must always be revalidated; the hashed asset
// files never change without their filename also changing, so they're safe
// to cache aggressively and permanently.
import { createServer } from 'node:http'
import sirv from 'sirv'

const port = process.env.PORT || 8080

const serve = sirv('dist', {
  single: true,
  setHeaders(res, pathname) {
    res.setHeader(
      'Cache-Control',
      pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate'
    )
  },
})

createServer((req, res) => serve(req, res)).listen(port, () => {
  console.log(`Serving dist/ on port ${port}`)
})
