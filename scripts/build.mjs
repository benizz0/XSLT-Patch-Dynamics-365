#!/usr/bin/env node
// Build the Dynamics solution package(s).
//
//   node scripts/build.mjs                 -> all default targets (8.2, 9.1, 9.2)
//   node scripts/build.mjs --target 8.2    -> one target (repeatable)
//   node scripts/build.mjs --version 1.0.1.0
//   node scripts/build.mjs --managed       -> managed solutions (<Managed>1</Managed>)
//   node scripts/build.mjs --no-minify     -> readable polyfill (debug)
//   node scripts/build.mjs --check         -> build web resources + checks, no zip
//
// Outputs:
//   build/webresources/<web resource name>   (served by `npm run serve`)
//   dist/<target>/                           (unpacked solution, for review)
//   dist/<UniqueName>_<version>_crm<target>[_managed].zip
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createZip } from './lib/zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fromRoot = (...segments) => path.join(ROOT, ...segments);
const VENDOR = fromRoot('vendor', 'xslt_polyfill');

// ---------- args ----------
function parseArgs(argv) {
  const args = { targets: [], version: null, minify: true, check: false, managed: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') args.targets.push(argv[++i]);
    else if (arg === '--version') args.version = argv[++i];
    else if (arg === '--no-minify') args.minify = false;
    else if (arg === '--check') args.check = true;
    else if (arg === '--managed') args.managed = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
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

function fillTokens(template, tokens, label) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (token, key) => {
    if (!(key in tokens)) throw new Error(`${label}: unknown token {{${key}}}`);
    return tokens[key];
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- web resources ----------
function buildLoader(tokens) {
  const dir = fromRoot('src', 'loader');
  const partFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.js')).sort();
  const source = partFiles.map((f) => fillTokens(read(path.join(dir, f)), tokens, `src/loader/${f}`)).join('\n');
  new vm.Script(source, { filename: 'loader.js' }); // syntax check
  // The loader must stay ES5 (IE11 parses it on CRM 8.2 and must no-op).
  // Comments and string contents are removed first so they cannot match.
  const codeOnly = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  const es6Match = /\b(let|const|class)\s|=>|`|\.\.\.[A-Za-z_$]/.exec(codeOnly);
  assert(!es6Match, `loader is not ES5: found "${es6Match && es6Match[0]}"`);
  return source;
}

async function buildPolyfill(tokens, minify) {
  const glue = read(path.join(VENDOR, 'dist', 'xslt-wasm.js'));
  const polyfillSource = read(path.join(VENDOR, 'src', 'xslt-polyfill-src.js'));
  const prelude = fillTokens(read(fromRoot('src', 'polyfill', 'prelude.js')), tokens, 'prelude.js');
  const postlude = fillTokens(read(fromRoot('src', 'polyfill', 'postlude.js')), tokens, 'postlude.js');
  const combined = [prelude, glue, '\n  // ---- vendor/xslt_polyfill/src/xslt-polyfill-src.js ----', polyfillSource, postlude].join('\n');
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
  const versionMatch = /const xsltPolyfillVersion = '([^']+)'/.exec(read(path.join(VENDOR, 'src', 'xslt-polyfill-src.js')));
  return versionMatch ? versionMatch[1] : 'unknown';
}

// CRM 8.2 refuses any other character at import (0x8004F117, #9): "Web resource
// names may only include letters, numbers, periods, and nonconsecutive forward
// slash characters". The underscore of the publisher prefix is accepted too.
// 9.x is more lenient (hyphens), so 8.2 sets the rule for every target.
const WEB_RESOURCE_NAME = /^[A-Za-z0-9_.]+(?:\/[A-Za-z0-9_.]+)*$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function checkWebResources(config) {
  const prefix = `${config.publisher.customizationPrefix}_/`;
  const retired = config.retiredWebResources || [];
  const ids = new Set();
  const names = new Set();
  for (const wr of config.webResources) {
    assert(WEB_RESOURCE_NAME.test(wr.name), `Web resource name refused by CRM 8.2 (letters, digits, "_", "." and single "/" only): ${wr.name}`);
    assert(wr.name.startsWith(prefix), `Web resource name must start with "${prefix}": ${wr.name}`);
    assert(GUID.test(wr.id), `Web resource ${wr.name}: id must be a lower-case GUID, got ${wr.id}`);
    assert(!ids.has(wr.id), `Web resource id used twice: ${wr.id}`);
    assert(!names.has(wr.name.toLowerCase()), `Web resource name used twice: ${wr.name}`);
    ids.add(wr.id);
    names.add(wr.name.toLowerCase());
  }
  for (const retiredWr of retired) {
    assert(!ids.has(retiredWr.id), `Web resource id ${retiredWr.id} is retired (${retiredWr.name}), give it a new GUID`);
    assert(!names.has(retiredWr.name.toLowerCase()), `Web resource name ${retiredWr.name} is retired, pick another name`);
  }
}

// ---------- solution xml ----------
function webResourcePath(name) {
  return `/WebResources/${name}`;
}

function webResourcesXml(config) {
  return config.webResources
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
      <FileName>${xmlEscape(webResourcePath(wr.name))}</FileName>
    </WebResource>`
    )
    .join('\n');
}

function rootComponentsXml(config, target) {
  const behavior = target.rootComponentBehavior ? ' behavior="0"' : '';
  const lines = config.webResources.map(
    (wr) => `      <RootComponent type="61" schemaName="${xmlEscape(wr.name)}"${behavior} />`
  );
  // type 50 = application ribbon (RibbonDiffXml without entity).
  lines.push(`      <RootComponent type="50" schemaName=":RibbonDiffXml"${behavior} />`);
  return lines.join('\n');
}

function contentTypesXml(fileNames) {
  const extensions = new Set(['xml']);
  const extensionless = [];
  for (const fileName of fileNames) {
    const baseName = fileName.split('/').pop();
    const dot = baseName.lastIndexOf('.');
    if (dot > 0) extensions.add(baseName.slice(dot + 1).toLowerCase());
    else extensionless.push(fileName);
  }
  const defaultsXml = [...extensions]
    .sort()
    .map((ext) => `<Default Extension="${ext}" ContentType="application/octet-stream" />`)
    .join('');
  const overridesXml = extensionless
    .map((fileName) => `<Override PartName="/${xmlEscape(fileName)}" ContentType="application/octet-stream" />`)
    .join('');
  return `﻿<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaultsXml}${overridesXml}</Types>`;
}

function checkXml(label, xml) {
  assert(!/\{\{[A-Z0-9_]+\}\}/.test(xml), `${label}: unreplaced token`);
  // Cheap well-formedness check: balanced tags (no CDATA/comments with tags expected).
  const stripped = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  const stack = [];
  const tagPattern = /<(\/?)([A-Za-z_][\w:.-]*)[^>]*?(\/?)>/g;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(stripped))) {
    const [, closing, name, selfClosing] = tagMatch;
    if (selfClosing) continue;
    if (closing) {
      const openName = stack.pop();
      assert(openName === name, `${label}: </${name}> closes <${openName}>`);
    } else stack.push(name);
  }
  assert(stack.length === 0, `${label}: unclosed <${stack.pop()}>`);
}

// Regression guard for #7: the customizations.xml root must match what the target's XSD
// accepts, and nodes stripped for the target must really be gone.
function checkCustomizationsRoot(targetKey, target, xml) {
  const rootTag = /<ImportExportXml\b[^>]*>/.exec(xml);
  assert(rootTag, `${targetKey} customizations.xml: no <ImportExportXml> root`);
  const attrs = new Set([...rootTag[0].matchAll(/\s([\w:]+)="/g)].map((match) => match[1]));
  const orgAttrs = ['OrganizationVersion', 'OrganizationSchemaType'];
  for (const attr of orgAttrs) {
    assert(
      attrs.has(attr) === target.customizationsOrganizationAttributes,
      `${targetKey} customizations.xml: root attribute ${attr} ${attrs.has(attr) ? 'present' : 'missing'}`
    );
  }
  const allowed = new Set(['xmlns:xsi', ...orgAttrs]);
  for (const attr of attrs) assert(allowed.has(attr), `${targetKey} customizations.xml: unexpected root attribute ${attr}`);
  for (const node of target.stripCustomizationNodes || []) {
    assert(!new RegExp(`<${node}[\\s/>]`).test(xml), `${targetKey} customizations.xml: <${node}> not stripped`);
  }
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Some ribbon locations do not exist on every target (Mscrm.GlobalTab is UCI only, so CRM 8.2
// refuses the import with 0x8004F107, see #11). The target lists the CustomActions to drop.
// The comment right above a dropped CustomAction goes with it.
function stripRibbonCustomActions(targetKey, target, ribbon) {
  const ids = target.excludeRibbonCustomActions || [];
  assert(Array.isArray(ids), `Target ${targetKey}: "excludeRibbonCustomActions" must be an array`);
  for (const id of ids) {
    const customActionPattern = new RegExp(
      `(?:[ \\t]*<!--(?:(?!-->)[\\s\\S])*-->\\s*)?[ \\t]*<CustomAction\\s+Id="${escapeRegExp(id)}"[\\s\\S]*?</CustomAction>[ \\t]*\\r?\\n?`
    );
    assert(customActionPattern.test(ribbon), `Target ${targetKey}: excluded CustomAction ${id} not found in RibbonDiffXml.xml`);
    ribbon = ribbon.replace(customActionPattern, '');
  }
  return ribbon;
}

// Regression guard for #11: no ribbon element of the target may sit on a location the
// target does not have. Comments are ignored, only attribute values count.
function checkRibbonLocations(targetKey, target, ribbon) {
  const forbidden = target.forbiddenRibbonLocations || [];
  assert(Array.isArray(forbidden), `Target ${targetKey}: "forbiddenRibbonLocations" must be an array`);
  const uncommented = ribbon.replace(/<!--[\s\S]*?-->/g, '');
  const values = [...uncommented.matchAll(/\s(?:Location|Id|Command|Library)="([^"]*)"/g)].map((match) => match[1]);
  for (const forbiddenRoot of forbidden) {
    const hit = values.find((value) => value === forbiddenRoot || value.startsWith(`${forbiddenRoot}.`));
    assert(!hit, `Target ${targetKey}: ribbon references ${hit}, unavailable on this target (forbiddenRibbonLocations)`);
  }
}

// Cache-buster (?ver=) on the web resource URLs the loader builds itself (#13). CRM 8.2
// answers HTTP 500 to a non-integer ver ("1.0.0.9"), so its target uses an integer:
// a.b.c.d -> a*1000000 + b*10000 + c*100 + d (b, c, d < 100, result fits an Int32).
function webResourceVer(targetKey, target, version) {
  const format = target.webResourceVerFormat || 'version';
  // Regression guard for #13: dropping the key from the 8.x target must not go unnoticed.
  assert(
    !/^8\./.test(target.organizationVersion) || format === 'integer',
    `Target ${targetKey}: CRM 8.x answers HTTP 500 to a dotted ?ver=, "webResourceVerFormat" must be "integer" (#13)`
  );
  if (format === 'version') return version;
  assert(format === 'integer', `Target ${targetKey}: "webResourceVerFormat" must be "version" or "integer", got ${format}`);
  const [a, b, c, d] = version.split('.').map(Number);
  assert(b < 100 && c < 100 && d < 100, `Target ${targetKey}: version ${version} has a part >= 100, no integer ver possible`);
  const integerVer = a * 1000000 + b * 10000 + c * 100 + d;
  assert(integerVer <= 2147483647, `Target ${targetKey}: integer ver ${integerVer} does not fit an Int32`);
  return String(integerVer);
}

function buildSolution(config, targetKey, version, webResourceContents, managed) {
  const target = config.targets[targetKey];
  assert(target, `Unknown target ${targetKey} (see solution/solution.config.json "targets")`);
  const loaderWr = config.webResources.find((wr) => wr.build === 'loader');

  const ribbon = stripRibbonCustomActions(targetKey, target, fillTokens(read(fromRoot('solution', 'ribbon', 'RibbonDiffXml.xml')), {
    LOADER_LIBRARY: `$webresource:${loaderWr.name}`
  }, 'RibbonDiffXml.xml'));
  checkRibbonLocations(targetKey, target, ribbon);
  assert(/<CustomAction\s/.test(ribbon), `Target ${targetKey}: no CustomAction left, the loader would never load`);

  const commonTokens = {
    ORG_VERSION: target.organizationVersion,
    PACKAGE_VERSION: target.packageVersion,
    BASE_LANGUAGE: String(config.baseLanguage)
  };

  // CRM 8.2 XSD does not declare OrganizationVersion / OrganizationSchemaType on the
  // customizations.xml root (import fails with 0x8004801A, see #7). 9.x exports carry them.
  const orgAttrs = target.customizationsOrganizationAttributes;
  assert(typeof orgAttrs === 'boolean', `Target ${targetKey}: "customizationsOrganizationAttributes" must be true or false`);
  let customizations = fillTokens(read(fromRoot('solution', 'templates', 'Customizations.xml')), {
    ...commonTokens,
    CUSTOMIZATIONS_ROOT_ATTRIBUTES: orgAttrs
      ? ` OrganizationVersion="${xmlEscape(target.organizationVersion)}" OrganizationSchemaType="Full"`
      : '',
    WEB_RESOURCES: webResourcesXml(config),
    RIBBON_DIFF_XML: ribbon
  }, 'Customizations.xml');
  for (const node of target.stripCustomizationNodes || []) {
    customizations = customizations.replace(new RegExp(`\\s*<${node}\\s*/>|\\s*<${node}>[\\s\\S]*?</${node}>`, 'g'), '');
  }
  checkCustomizationsRoot(targetKey, target, customizations);

  const solution = fillTokens(read(fromRoot('solution', 'templates', 'Solution.xml')), {
    ...commonTokens,
    UNIQUE_NAME: xmlEscape(config.uniqueName),
    DISPLAY_NAME: xmlEscape(config.displayName),
    DESCRIPTION: xmlEscape(config.description),
    VERSION: version,
    MANAGED: managed ? '1' : '0',
    PUBLISHER_UNIQUE_NAME: xmlEscape(config.publisher.uniqueName),
    PUBLISHER_DISPLAY_NAME: xmlEscape(config.publisher.displayName),
    PUBLISHER_WEBSITE: xmlEscape(config.publisher.supportingWebsiteUrl),
    PUBLISHER_PREFIX: xmlEscape(config.publisher.customizationPrefix),
    PUBLISHER_OPTION_PREFIX: String(config.publisher.optionValuePrefix),
    ROOT_COMPONENTS: rootComponentsXml(config, target)
  }, 'Solution.xml');

  checkXml('customizations.xml', customizations);
  checkXml('solution.xml', solution);

  const files = [
    { name: 'solution.xml', data: Buffer.from(solution, 'utf8') },
    { name: 'customizations.xml', data: Buffer.from(customizations, 'utf8') },
    ...config.webResources.map((wr) => ({
      name: webResourcePath(wr.name).slice(1),
      data: Buffer.from(webResourceContents[wr.name], 'utf8')
    }))
  ];
  files.unshift({ name: '[Content_Types].xml', data: Buffer.from(contentTypesXml(files.map((f) => f.name)), 'utf8') });
  return files;
}

// ---------- main ----------
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = JSON.parse(read(fromRoot('solution', 'solution.config.json')));
  const version = args.version || config.version;
  assert(/^\d+\.\d+\.\d+\.\d+$/.test(version), `Version must be a.b.c.d, got ${version}`);
  const targets = args.targets.length ? args.targets : config.defaultTargets;
  checkWebResources(config);

  const polyfillWr = config.webResources.find((wr) => wr.build === 'polyfill');
  const loaderWr = config.webResources.find((wr) => wr.build === 'loader');
  const tokens = {
    BNZ_VERSION: version,
    POLYFILL_VERSION: polyfillVersion(),
    POLYFILL_WEBRESOURCE: polyfillWr.name,
    LOADER_WEBRESOURCE: loaderWr.name
  };

  console.log(`> web resources (solution ${version}, polyfill ${tokens.POLYFILL_VERSION})`);
  const contents = {};
  for (const wr of config.webResources) {
    // build/webresources gets the loader with the default cache-buster; a target with
    // another webResourceVerFormat gets its own copy in its package (see below).
    if (wr.build === 'loader') contents[wr.name] = buildLoader({ ...tokens, WEBRESOURCE_VER: version });
    else if (wr.build === 'polyfill') contents[wr.name] = await buildPolyfill(tokens, args.minify);
    else if (wr.source) contents[wr.name] = read(fromRoot(wr.source));
    else throw new Error(`Web resource ${wr.name}: needs "build" or "source"`);
    const outPath = fromRoot('build', 'webresources', ...wr.name.split('/'));
    write(outPath, contents[wr.name]);
    console.log(`  ${wr.name}  ${(Buffer.byteLength(contents[wr.name]) / 1024).toFixed(1)} KB`);
  }

  for (const targetKey of targets) {
    assert(config.targets[targetKey], `Unknown target ${targetKey} (see solution/solution.config.json "targets")`);
    const cacheBusterVer = webResourceVer(targetKey, config.targets[targetKey], version);
    const targetContents = cacheBusterVer === version
      ? contents
      : { ...contents, [loaderWr.name]: buildLoader({ ...tokens, WEBRESOURCE_VER: cacheBusterVer }) };
    assert(
      targetContents[loaderWr.name].includes(`webResourceVer: '${cacheBusterVer}'`),
      `Target ${targetKey}: loader does not carry webResourceVer '${cacheBusterVer}'`
    );
    if (cacheBusterVer !== version) console.log(`> ${targetKey}: loader with ?ver=${cacheBusterVer}`);
    const files = buildSolution(config, targetKey, version, targetContents, args.managed);
    const suffix = args.managed ? '_managed' : '';
    const targetTag = `crm${targetKey.replace('.', '')}${suffix}`;
    const stageDir = fromRoot('dist', targetTag);
    fs.rmSync(stageDir, { recursive: true, force: true });
    for (const file of files) write(path.join(stageDir, ...file.name.split('/')), file.data);
    if (args.check) {
      console.log(`> ${targetKey}${suffix}: checked (${files.length} files, no zip)`);
      continue;
    }
    const zipName = `${config.uniqueName}_${version.replace(/\./g, '_')}_${targetTag}.zip`;
    const zipPath = fromRoot('dist', zipName);
    write(zipPath, createZip(files));
    console.log(`> ${targetKey}${suffix}: dist/${zipName}  ${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(`build failed: ${err.message}`);
  process.exit(1);
});
