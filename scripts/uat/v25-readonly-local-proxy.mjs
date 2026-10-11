// Local V2.5 read-only UAT gate. Browser Auth talks directly to test Supabase;
// this proxy never forwards application writes (including automatic page views).
import { createServer, request as httpRequest } from 'node:http';

const listenHost = '127.0.0.1';
const listenPort = 3000;
const upstreamHost = '127.0.0.1';
const upstreamPort = 3001;

const server = createServer((incoming, outgoing) => {
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
    incoming.resume();
    outgoing.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', Allow: 'GET, HEAD' });
    outgoing.end('本地只读验收：写请求已阻断。');
    return;
  }

  const forwarded = httpRequest({
    hostname: upstreamHost,
    port: upstreamPort,
    method: incoming.method,
    path: incoming.url,
    headers: { ...incoming.headers, host: `localhost:${listenPort}` },
  }, (response) => {
    const headers = { ...response.headers };
    if (typeof headers.location === 'string') {
      headers.location = headers.location.replace(/^http:\/\/(?:localhost|127\.0\.0\.1):3001(?=\/|$)/, `http://localhost:${listenPort}`);
    }
    outgoing.writeHead(response.statusCode ?? 502, headers);
    response.pipe(outgoing);
  });
  forwarded.setTimeout(30000, () => forwarded.destroy(new Error('UPSTREAM_TIMEOUT')));
  forwarded.on('error', () => {
    if (outgoing.headersSent) return outgoing.destroy();
    outgoing.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    outgoing.end('本地测试服务暂不可用。');
  });
  incoming.pipe(forwarded);
});

server.listen(listenPort, listenHost, () => {
  process.stdout.write(`V25_READONLY_PROXY_READY http://${listenHost}:${listenPort} -> ${upstreamHost}:${upstreamPort}; only GET/HEAD forwarded\n`);
});
