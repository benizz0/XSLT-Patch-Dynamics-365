#!/usr/bin/env node
// Shows how the local fork (vendor/xslt_polyfill) differs from upstream.
//
//   node scripts/vendor-status.mjs            -> diff vs commit in UPSTREAM.json
//   node scripts/vendor-status.mjs --latest   -> also list upstream commits since then
//
// Clones upstream into the OS temp dir (never into the repo), then runs
// `git diff --no-index`. Nothing in vendor/ is modified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = path.join(ROOT, 'vendor', 'xslt_polyfill');
const upstream = JSON.parse(fs.readFileSync(path.join(VENDOR, 'UPSTREAM.json'), 'utf8'));
const latest = process.argv.includes('--latest');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xslt-upstream-'));
const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', ...opts });

try {
  git(['clone', '--quiet', '--filter=blob:none', upstream.repository, tmp]);
  if (latest) {
    console.log(`# upstream commits since ${upstream.commit.slice(0, 10)}:`);
    console.log(git(['-C', tmp, 'log', '--oneline', `${upstream.commit}..origin/${upstream.branch}`]) || '(none)');
  }
  git(['-C', tmp, 'checkout', '--quiet', upstream.commit]);
  for (const rel of ['src/xslt-polyfill-src.js', 'src/transform.c', 'Makefile', 'scripts/combine.js']) {
    try {
      git(['diff', '--no-index', '--stat', path.join(tmp, rel), path.join(VENDOR, rel)]);
      console.log(`= ${rel}`);
    } catch (e) {
      // git diff --no-index exits 1 when files differ.
      console.log(`~ ${rel}\n${e.stdout}`);
    }
  }
  const marks = fs.readFileSync(path.join(VENDOR, 'src', 'xslt-polyfill-src.js'), 'utf8').match(/DYN-\d+ begin/g) || [];
  console.log(`DYN blocks in src/xslt-polyfill-src.js: ${marks.length}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
