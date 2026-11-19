#!/usr/bin/env node
// Removes build outputs (build/ and dist/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of ['build', 'dist']) {
  fs.rmSync(path.join(ROOT, dir), { recursive: true, force: true });
  console.log(`removed ${dir}/`);
}
