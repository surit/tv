# Prasaran — setup

Two files you need to host:
- `index.html` — the site
- `channels_data.js` — your 347 channels, parsed from the M3U

`worker.js` is optional (see "Want something sturdier" below).

## Why streams needed help in the first place

Every stream URL in your playlist is `http://`. GitHub Pages (and any host)
serves your site over `https://`. Browsers refuse to load `http://` video
from an `https://` page — that's a fixed browser security rule, not
something fixable in the site's own code alone.

## Default setup: zero deployment

`index.html` now routes every stream through a chain of free public CORS
proxies (no account, no setup) that fetch the `http://` stream server-side
and hand it back over `https://`. It also rewrites the `.m3u8` playlist in
the browser so video segments get proxied too, not just the manifest, and
if one proxy is down or rate-limited it automatically tries the next.

Just push `index.html` and `channels_data.js` to your GitHub repo and
enable Pages. Nothing to configure.

**Trade-off:** these are free third-party services you don't control, so
expect occasional slowness, a failed load here and there, or one going
down entirely. "Retry inline" and "Open stream in new tab" are there for
when that happens.

## Want something sturdier later?

If the public proxies feel too flaky, `worker.js` is a small proxy you can
run yourself on a free platform (Cloudflare Workers, Deno Deploy, etc.) —
same idea, but only your site uses it, so it won't get bogged down by
other people's traffic. If you want to try that route later, just ask and
I'll walk through whichever platform is easiest for you at that point.
Paste the deployed URL into `OWN_PROXY_URL` near the top of `index.html`'s
script and it'll be tried before the public proxies.
