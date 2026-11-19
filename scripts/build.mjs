#!/usr/bin/env node
// Build the Dynamics solution package(s).
//
//   node scripts/build.mjs                 -> all default targets (8.2 + 9.2)
//   node scripts/build.mjs --target 8.2    -> one target (repeatable)
//   node scripts/build.mjs --version 1.0.1.0
//   node scripts/build.mjs --no-minify     -> readable polyfill (debug)
//   node scripts/build.mjs --check         -> build web resources + checks, no zip
//
// Outputs:
//   build/webresources/<web resource name>   (served by `npm run serve`)
//   dist/<target>/                           (unpacked solution, for review)
//   dist/<UniqueName>_<version>_crm<target>.zip
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createZip } from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(ROOT, ...p);
const VENDOR = P('vendor', 'xslt_polyfill');

// ---------- args ----------
function parseArgs(argv) {
  const args = { targets: [], version: null, minify: true, check: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.targets.push(argv[++i]);
    else if (a === '--version') args.version = argv[++i];
    else if (a === '--no-minify') args.minify = false;
    else if (a === '--check') args.check = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// ---------- helpers ----------
const read = (f) => fs.readFileSync(f, 'utf8');
const write = (f, content) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
};
const xmlEscape = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fill(template, tokens, label) {
  const out = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (m, key) => {
    if (!(key in tokens)) throw new Error(`${label}: unknown token {{${key}}}`);
    return tokens[key];
  });
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- web resources ----------
function buildLoader(tokens) {
  const dir = P('src', 'loader');
  const parts = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const source = parts.map((f) => fill(read(path.join(dir, f)), tokens, `src/loader/${f}`)).join('\n');
  new vm.Script(source, { filename: 'loader.js' }); // syntax check
  // The loader must stay ES5 (IE11 parses it on CRM 8.2 and must no-op).
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  const es6 = /\b(let|const|class)\s|=>|`|\.\.\.[A-Za-z_$]/.exec(code);
  assert(!es6, `loader is not ES5: found "${es6 && es6[0]}"`);
  return source;
}

async function buildPolyfill(tokens, minify) {
  const glue = read(path.join(VENDOR, 'dist', 'xslt-wasm.js'));
  const src = read(path.join(VENDOR, 'src', 'xslt-polyfill-src.js'));
  const prelude = fill(read(P('src', 'polyfill', 'prelude.js')), tokens, 'prelude.js');
  const postlude = fill(read(P('src', 'polyfill', 'postlude.js')), tokens, 'postlude.js');
  const combined = [prelude, glue, '\n  // ---- vendor/xslt_polyfill/src/xslt-polyfill-src.js ----', src, postlude].join('\n');
  if (!minify) {
    new vm.Script(combined, { filename: 'xslt-polyfill.js' });
    return combined;
  }
  const { minify: terserMinify } = await import('terser').catch(() => {
    throw new Error('terser is missing: run `npm install` (or build with --no-minify).');
  });
  const result = await terserMinify(combined, {
    compress: true,
    mangle: true,
    format: { comments: /^!/ }
  });
  return result.code;
}

function polyfillVersion() {
  const m = /const xsltPolyfillVersion = '([^']+)'/.exec(read(path.join(VENDOR, 'src', 'xslt-polyfill-src.js')));
  return m ? m[1] : 'unknown';
}

// ---------- solution xml ----------
function webResourceFileName(name) {
  return `/WebResources/${name}`;
}

function webResourcesXml(cfg) {
  return cfg.webResources
    .map(
      (wr) => `    <WebResource>
      <WebResourceId>{${wr.id}}</WebResourceId>
      <Name>${xmlEscape(wr.name)}</Name>
      <DisplayName>${xmlEscape(wr.displayName)}</DisplayName>
      <Description>${xmlEscape(wr.description || '')}</Description>
      <WebResourceType>${wr.type}</WebResourceType>
      <IntroducedVersion>1.0</IntroducedVersion>
      <IsEnabledForMobileClient>0</IsEnabledForMobileClient>
      <IsAvailableForMobileOffline>0</IsAvailableForMobileOffline>
      <IsCustomizable>1</IsCustomizable>
      <CanBeDeleted>1</CanBeDeleted>
      <IsHidden>0</IsHidden>
      <FileName>${xmlEscape(webResourceFileName(wr.name))}</FileName>
    </WebResource>`
    )
    .join('\n');
}

function rootComponentsXml(cfg, target) {
  const behavior = target.rootComponentBehavior ? ' behavior="0"' : '';
  const lines = cfg.webResources.map(
    (wr) => `      <RootComponent type="61" schemaName="${xmlEscape(wr.name)}"${behavior} />`
  );
  // type 50 = application ribbon (RibbonDiffXml without entity).
  lines.push(`      <RootComponent type="50" schemaName=":RibbonDiffXml"${behavior} />`);
  return lines.join('\n');
}

function contentTypesXml(fileNames) {
  const exts = new Set(['xml']);
  const overrides = [];
  for (const f of fileNames) {
    const base = f.split('/').pop();
    const dot = base.lastIndexOf('.');
    if (dot > 0) exts.add(base.slice(dot + 1).toLowerCase());
    else overrides.push(f);
  }
  const defaults = [...exts]
    .sort()
    .map((e) => `<Default Extension="${e}" ContentType="application/octet-stream" />`)
    .join('');
  const ov = overrides
    .map((f) => `<Override PartName="/${xmlEscape(f)}" ContentType="application/octet-stream" />`)
    .join('');
  return `﻿<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}${ov}</Types>`;
}

function checkXml(label, xml) {
  assert(!/\{\{[A-Z0-9_]+\}\}/.test(xml), `${label}: unreplaced token`);
  // Cheap well-formedness check: balanced tags (no CDATA/comments with tags expected).
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const stack = [];
  const re = /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(stripped))) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      const open = stack.pop();
      assert(open === name, `${label}: </${name}> closes <${open}>`);
    } else stack.push(name);
  }
  assert(stack.length === 0, `${label}: unclosed <${stack.pop()}>`);
}

function buildSolution(cfg, targetKey, version, webResourceContents) {
  const target = cfg.targets[targetKey];
  assert(target, `Unknown target ${targetKey} (see solution/solution.config.json "targets")`);
  const loader = cfg.webResources.find((w) => w.build === 'loader');

  const ribbon = fill(read(P('solution', 'ribbon', 'RibbonDiffXml.xml')), {
    LOADER_LIBRARY: `$webresource:${loader.name}`
  }, 'RibbonDiffXml.xml');

  const common = {
    ORG_VERSION: target.organizationVersion,
    PACKAGE_VERSION: target.packageVersion,
    BASE_LANGUAGE: String(cfg.baseLanguage)
  };

  let customizations = fill(read(P('solution', 'templates', 'Customizations.xml')), {
    ...common,
    WEB_RESOURCES: webResourcesXml(cfg),
    RIBBON_DIFF_XML: ribbon
  }, 'Customizations.xml');
  for (const node of target.stripCustomizationNodes || []) {
    customizations = customizations.replace(new RegExp(`\\s*<${node}\\s*/>|\\s*<${node}>[\\s\\S]*?</${node}>`, 'g'), '');
  }

  const solution = fill(read(P('solution', 'templates', 'Solution.xml')), {
    ...common,
    UNIQUE_NAME: xmlEscape(cfg.uniqueName),
    DISPLAY_NAME: xmlEscape(cfg.displayName),
    DESCRIPTION: xmlEscape(cfg.description),
    VERSION: version,
    PUBLISHER_UNIQUE_NAME: xmlEscape(cfg.publisher.uniqueName),
    PUBLISHER_DISPLAY_NAME: xmlEscape(cfg.publisher.displayName),
    PUBLISHER_WEBSITE: xmlEscape(cfg.publisher.supportingWebsiteUrl),
    PUBLISHER_PREFIX: xmlEscape(cfg.publisher.customizationPrefix),
    PUBLISHER_OPTION_PREFIX: String(cfg.publisher.optionValuePrefix),
    ROOT_COMPONENTS: rootComponentsXml(cfg, target)
  }, 'Solution.xml');

  checkXml('customizations.xml', customizations);
  checkXml('solution.xml', solution);

  const files = [
    { name: 'solution.xml', data: Buffer.from(solution, 'utf8') },
    { name: 'customizations.xml', data: Buffer.from(customizations, 'utf8') },
    ...cfg.webResources.map((wr) => ({
      name: webResourceFileName(wr.name).slice(1),
      data: Buffer.from(webResourceContents[wr.name], 'utf8')
    }))
  ];
  files.unshift({ name: '[Content_Types].xml', data: Buffer.from(contentTypesXml(files.map((f) => f.name)), 'utf8') });
  return files;
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cfg = JSON.parse(read(P('solution', 'solution.config.json')));
  const version = args.version || cfg.version;
  assert(/^\d+\.\d+\.\d+\.\d+$/.test(version), `Version must be a.b.c.d, got ${version}`);
  const targets = args.targets.length ? args.targets : cfg.defaultTargets;

  const polyfillWr = cfg.webResources.find((w) => w.build === 'polyfill');
  const loaderWr = cfg.webResources.find((w) => w.build === 'loader');
  const tokens = {
    BNZ_VERSION: version,
    POLYFILL_VERSION: polyfillVersion(),
    POLYFILL_WEBRESOURCE: polyfillWr.name,
    LOADER_WEBRESOURCE: loaderWr.name
  };

  console.log(`> web resources (solution ${version}, polyfill ${tokens.POLYFILL_VERSION})`);
  const contents = {};
  for (const wr of cfg.webResources) {
    if (wr.build === 'loader') contents[wr.name] = buildLoader(tokens);
    else if (wr.build === 'polyfill') contents[wr.name] = await buildPolyfill(tokens, args.minify);
    else if (wr.source) contents[wr.name] = read(P(wr.source));
    else throw new Error(`Web resource ${wr.name}: needs "build" or "source"`);
    const out = P('build', 'webresources', ...wr.name.split('/'));
    write(out, contents[wr.name]);
    console.log(`  ${wr.name}  ${(Buffer.byteLength(contents[wr.name]) / 1024).toFixed(1)} KB`);
  }

  for (const t of targets) {
    const files = buildSolution(cfg, t, version, contents);
    const stage = P('dist', `crm${t.replace('.', '')}`);
    fs.rmSync(stage, { recursive: true, force: true });
    for (const f of files) write(path.join(stage, ...f.name.split('/')), f.data);
    if (args.check) {
      console.log(`> ${t}: checked (${files.length} files, no zip)`);
      continue;
    }
    const zipName = `${cfg.uniqueName}_${version.replace(/\./g, '_')}_crm${t.replace('.', '')}.zip`;
    const zipPath = P('dist', zipName);
    write(zipPath, createZip(files));
    console.log(`> ${t}: dist/${zipName}  ${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
});
