#!/usr/bin/env node
// Release helpers (used by .github/workflows/release.yml, usable locally).
//
//   node scripts/release.mjs set-version 1.0.1.0
//       Checks the a.b.c.d format, refuses a version lower than the current one,
//       writes it to solution/solution.config.json. Prints "changed" or "unchanged".
//   node scripts/release.mjs notes 1.0.1.0
//       Prints the CHANGELOG.md section of that version (empty when missing).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'solution', 'solution.config.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const VERSION_RE = /^\d+\.\d+\.\d+\.\d+$/;

function fail(msg) {
  console.error(`release: ${msg}`);
  process.exit(1);
}

function compare(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

function setVersion(version) {
  const text = fs.readFileSync(CONFIG, 'utf8');
  const current = JSON.parse(text).version;
  if (compare(version, current) < 0) fail(`${version} is lower than the current version ${current}`);
  if (version === current) {
    console.log('unchanged');
    return;
  }
  // Targeted replace: keep the file's formatting.
  const updated = text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`);
  if (JSON.parse(updated).version !== version) fail('could not update solution.config.json');
  fs.writeFileSync(CONFIG, updated);
  console.log('changed');
}

function notes(version) {
  const lines = fs.readFileSync(CHANGELOG, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## [${version}]`));
  if (start === -1) return;
  let end = lines.findIndex((l, i) => i > start && /^## \[/.test(l));
  if (end === -1) end = lines.length;
  process.stdout.write(lines.slice(start + 1, end).join('\n').trim() + '\n');
}

const [command, version] = process.argv.slice(2);
if (!VERSION_RE.test(version || '')) fail(`version must be a.b.c.d, got "${version || ''}"`);
if (command === 'set-version') setVersion(version);
else if (command === 'notes') notes(version);
else fail(`unknown command "${command || ''}" (set-version | notes)`);
