import http from 'http'; import fs from 'fs'; import path from 'path';
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
export function serve(root, port) {
  return new Promise((res) => {
    const srv = http.createServer((q, s) => {
      const p = path.join(root, decodeURIComponent(q.url.split('?')[0]));
      fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); s.end(d); });
    }).listen(port, () => res(srv));
  });
}
