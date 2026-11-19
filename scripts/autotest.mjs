#!/usr/bin/env node
// Runs test/harness/?autotest=1 in headless Chrome/Edge and prints results.
// Needs a prior `npm run build` (serves build/webresources).
//   node scripts/autotest.mjs            (browser: $BROWSER, else Chrome, else Edge)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8000 + Math.floor(Math.random() * 900);

const candidates = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) {
  console.error('No Chrome/Edge found; set BROWSER=<path>.');
  process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, 'build', 'webresources', 'bnz_', 'xsltpatch', 'loader.js'))) {
  console.error('Run `npm run build` first.');
  process.exit(2);
}

const server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs'), String(PORT)], { stdio: 'pipe' });
await new Promise((resolve) => server.stdout.once('data', resolve));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bnz-xslt-autotest-'));
const url = `http://127.0.0.1:${PORT}/?autotest=1`;
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-popup-blocking',
  // GitHub Linux runners (Ubuntu 24.04) block the Chrome sandbox (AppArmor).
  ...(process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : []),
  `--user-data-dir=${profile}`,
  '--virtual-time-budget=180000',
  '--dump-dom',
  url
];

let dom = '';
const proc = spawn(browser, args, { stdio: ['ignore', 'pipe', 'ignore'] });
proc.stdout.on('data', (d) => (dom += d));
const code = await new Promise((resolve) => proc.on('close', resolve));
server.kill();
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  /* browser may still hold files */
}

const title = (/<title>([^<]*)<\/title>/.exec(dom) || [])[1] || '(no title)';
const resultsHtml = (/<pre id="results">([\s\S]*?)<\/pre>/.exec(dom) || [])[1] || '';
const lines = resultsHtml
  .split(/<\/div>/)
  .map((l) => l.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim())
  .filter(Boolean);
console.log(`browser: ${path.basename(browser)} (exit ${code})`);
for (const l of lines) console.log('  ' + l);
console.log(title);
process.exit(/AUTOTEST PASS/.test(title) ? 0 : 1);
