#!/usr/bin/env node
// Local test server for test/harness (no Dynamics needed).
//   /WebResources/<name>  -> build/webresources/<name>   (run `npm run build` first)
//   /*                    -> test/harness/*
// Usage: node scripts/serve.mjs [port]   (default 8282)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8282);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.aspx': 'text/html; charset=utf-8',
  '.js': 'text/javascript', // no charset on purpose: mimics Dynamics (DYN-004)
  '.xml': 'text/xml',
  '.xsl': 'text/xml',
  '.css': 'text/css'
};

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  let base = path.join(ROOT, 'test', 'harness');
  let rel = clean;
  if (/^\/webresources\//i.test(clean)) {
    base = path.join(ROOT, 'build', 'webresources');
    rel = clean.replace(/^\/webresources\//i, '/');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(base, rel));
  return file.startsWith(base) ? file : null;
}

http
  .createServer((req, res) => {
    const file = resolve(req.url);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`harness: http://127.0.0.1:${port}/  (autotest: /?autotest=1)`);
  });
