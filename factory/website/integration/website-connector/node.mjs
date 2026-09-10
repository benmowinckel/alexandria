/** Thin Node 20+ adapter. Returns false outside the mount; the caller retains
 * its existing router, static host, assets, headers and pages unchanged. */
export function nodeConnector({ handle, site, prefix = '/_alexandria' }) {
  const origin = new URL(site).origin;
  return async function connectedRoute(request, response) {
    if (!request.url?.startsWith('/') || request.url.startsWith('//')) return false;
    const url = new URL(request.url, origin);
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return false;
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
      let body;
      if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 128 * 1024) {
            response.writeHead(413, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
            response.end(JSON.stringify({ error: 'Send a request smaller than 128 KiB.', reason: 'body_too_large' }));
            return true;
          }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      const abort = new AbortController();
      response.on('close', () => { if (!response.writableEnded) abort.abort(); });
      const result = await handle(new Request(url, { method: request.method, headers, body, signal: abort.signal }));
      if (!result) return false;
      response.statusCode = result.status;
      result.headers.forEach((value, key) => { if (key !== 'set-cookie') response.setHeader(key, value); });
      const cookies = result.headers.getSetCookie();
      if (cookies.length) response.setHeader('Set-Cookie', cookies);
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      if (!response.headersSent) response.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' });
      response.end(JSON.stringify({ error: 'Connection unavailable.', reason: 'unavailable' }));
    }
    return true;
  };
}
