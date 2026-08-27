/**
 * Prasaran stream proxy — Cloudflare Worker
 *
 * Fetches an http:// stream server-side and returns it over https://,
 * so a static site (GitHub Pages, Netlify, etc.) can play http-only
 * IPTV streams without hitting the browser's mixed-content block.
 *
 * It also rewrites .m3u8 playlists so every segment/sub-playlist URL
 * routes back through this same proxy — otherwise the manifest loads
 * fine but each video segment still gets blocked.
 *
 * Deploy: paste this whole file into a new Worker in the Cloudflare
 * dashboard (Workers & Pages -> Create -> "Hello World" template ->
 * replace the code -> Deploy). You'll get a URL like
 * https://prasaran-proxy.<your-subdomain>.workers.dev
 *
 * Then in channels_data.js / index.html, set PROXY_URL to that address.
 */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };
}

function passthroughHeaders(upstream) {
  const h = new Headers(upstream.headers);
  h.set("Access-Control-Allow-Origin", "*");
  h.delete("content-security-policy");
  h.delete("content-encoding"); // avoid double-decode issues in the runtime
  h.delete("content-length"); // length can change after we rewrite text
  return h;
}

function rewritePlaylist(text, baseUrl, proxyBase) {
  const base = new URL(baseUrl);
  const lines = text.split("\n");
  const out = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    if (trimmed.startsWith("#")) {
      // Tags like #EXT-X-KEY / #EXT-X-MAP carry their own URI="..." that
      // also needs to be routed through the proxy.
      if (trimmed.startsWith("#EXT-X-KEY") || trimmed.startsWith("#EXT-X-MAP")) {
        return line.replace(/URI="([^"]+)"/, (_m, uri) => {
          const abs = new URL(uri, base).href;
          return `URI="${proxyBase}?url=${encodeURIComponent(abs)}"`;
        });
      }
      return line;
    }

    // A media segment or a nested playlist reference.
    const abs = new URL(trimmed, base).href;
    return `${proxyBase}?url=${encodeURIComponent(abs)}`;
  });
  return out.join("\n");
}

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const target = reqUrl.searchParams.get("url");
    if (!target) {
      return new Response("Missing ?url= parameter", {
        status: 400,
        headers: corsHeaders(),
      });
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: { "User-Agent": "Mozilla/5.0 (Prasaran-Proxy)" },
        redirect: "follow",
      });
    } catch (err) {
      return new Response("Upstream fetch failed: " + err.message, {
        status: 502,
        headers: corsHeaders(),
      });
    }

    const finalUrl = upstream.url || target;
    const contentType = upstream.headers.get("content-type") || "";
    const looksLikePlaylist =
      contentType.includes("mpegurl") ||
      finalUrl.includes(".m3u8");

    if (looksLikePlaylist) {
      const text = await upstream.text();
      if (text.trim().startsWith("#EXTM3U")) {
        const proxyBase = reqUrl.origin + reqUrl.pathname;
        const rewritten = rewritePlaylist(text, finalUrl, proxyBase);
        return new Response(rewritten, {
          status: 200,
          headers: {
            ...corsHeaders(),
            "content-type": "application/vnd.apple.mpegurl",
          },
        });
      }
      // Content-type said playlist but body doesn't look like one — pass through as-is.
      return new Response(text, {
        status: upstream.status,
        headers: passthroughHeaders(upstream),
      });
    }

    // Binary passthrough: .ts segments, keys, thumbnails, etc.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: passthroughHeaders(upstream),
    });
  },
};
