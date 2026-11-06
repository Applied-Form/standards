/**
 * The config file, the baseline and the `.standards/` directory (decision 0029). The names they
 * replaced (`af.config.json`, `af-baseline.json`, `.af/`) were removed in 5.0.0: a file under an old
 * name is never read, written to or deleted, and a project that has one and no new name is refused
 * with one line (src/lib/removed-names.mjs, test/removed-names.test.mjs). This file spells the old
 * names on purpose, to prove that.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../src/lib/page-lint.mjs';
import { CONFIG, BASELINE, DIR } from '../src/lib/names.mjs';

// The names that were removed in 5.0.0, spelled out so that a search for them finds this file.
const OLD = { config: 'af.config.json', baseline: 'af-baseline.json', dir: '.af' };

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const STANDARDS = join(ROOT, 'bin/standards.mjs');
const scratch = () => mkdtempSync(join(tmpdir(), 'standards-config-'));
const write = (dir, name, text) => writeFileSync(join(dir, name), typeof text === 'string' ? text : `${JSON.stringify(text)}\n`);
const cleanEnv = () => { const env = { ...process.env }; delete env.STANDARDS_SYSTEM; return env; };
const run = (dir, ...args) => spawnSync(process.execPath, [STANDARDS, ...args], { cwd: dir, env: cleanEnv(), encoding: 'utf8' });

let chromium = null;
try { chromium = await launchBrowser(); await chromium.close(); } catch (e) { if (process.env.CI) throw e; }
const skip = chromium ? false : 'no Chromium';

const PAGE = '<!doctype html><html lang="en" data-register="ii"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>t</title></head><body>'
  + '<p style="color:#ccc;font-size:16px">Low contrast body text that is plainly too faint to read.</p></body></html>';

test('a config under the new name lowering a mandatory rule is refused, naming that file', () => {
  const dir = scratch();
  write(dir, 'page.html', PAGE);
  write(dir, CONFIG.name, { rules: { contrast: 'off' } });
  const r = run(dir, 'lint', 'page.html', '--sample', '0');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /"contrast" is mandatory/);
  assert.ok(r.stderr.includes(`${CONFIG.name}: `));
  assert.doesNotMatch(r.stderr, /deprecated/);
});

test('a config under the old name alone is refused with one line, and what it lowers is not applied', () => {
  const dir = scratch();
  write(dir, 'page.html', PAGE);
  write(dir, OLD.config, { rules: { contrast: 'warn' } });
  const r = run(dir, 'lint', 'page.html', '--sample', '0', '--json');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, `standards: ${OLD.config} is no longer read: rename it to ${CONFIG.name}\n`);
});

test('both configs exist: the new one is used, and the old one is not read or named', { skip }, () => {
  const dir = scratch();
  write(dir, 'page.html', PAGE);
  write(dir, OLD.config, { rules: { contrast: 'off' } });
  write(dir, CONFIG.name, { rules: { 'label-apca': 'off' } });
  const r = run(dir, 'lint', 'page.html', '--sample', '0', '--json');
  assert.equal(r.stderr.includes('is mandatory'), false, 'the old file is never read, so what it lowers is not refused');
  assert.equal(r.stderr, '', 'and it is only left over, so nothing is said');
  assert.deepEqual(JSON.parse(r.stdout).config.overrides, { 'label-apca': 'off' });
});

test('a system named in a config under the old name is refused, not loaded', () => {
  const dir = scratch();
  const floors = Object.fromEntries(['body-contrast', 'display-contrast', 'text-min-px'].map((k) => [k, { $value: 1 }]));
  write(dir, 'overlay.tokens.json', { floors });
  write(dir, OLD.config, { system: 'overlay.tokens.json' });
  const gone = run(dir, 'rules', '--json');
  assert.equal(gone.status, 2);
  assert.equal(gone.stderr, `standards: ${OLD.config} is no longer read: rename it to ${CONFIG.name}\n`);
  const named = scratch();
  write(named, 'overlay.tokens.json', { floors });
  write(named, CONFIG.name, { system: 'overlay.tokens.json' });
  const kept = run(named, 'rules', '--json');
  assert.notEqual(kept.status, 0, 'the same file under the new name is loaded');
  assert.match(kept.stderr, /floors\.body-contrast is 1, below the platform floor/);
});

test('a baseline under the old name alone is refused; beside the new one it is not read, written to or deleted', { skip }, () => {
  const dir = scratch();
  write(dir, 'page.html', PAGE);
  const held = { 'elsewhere.html@1280': { 'contrast|x': 2 } };
  const old = { version: 1, recorded: null, entries: held };
  write(dir, OLD.baseline, old);
  const refused = run(dir, 'baseline', 'page.html', '--sample', '0');
  assert.equal(refused.status, 2, refused.stdout + refused.stderr);
  assert.equal(refused.stderr, `standards: ${OLD.baseline} is no longer read: rename it to ${BASELINE.name}\n`);
  assert.deepEqual(readdirSync(dir).sort(), [OLD.baseline, 'page.html'], 'nothing is written');
  write(dir, BASELINE.name, { version: 1, recorded: null, entries: {} });
  const wrote = run(dir, 'baseline', 'page.html', '--sample', '0');
  assert.equal(wrote.status, 0, wrote.stdout + wrote.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, OLD.baseline), 'utf8')), old, 'the old file is untouched');
  assert.equal(JSON.parse(readFileSync(join(dir, BASELINE.name), 'utf8')).entries['elsewhere.html@1280'], undefined, 'what it held is not carried over');
});

test('baseline in an empty directory writes the new name, silently', { skip }, () => {
  const dir = scratch();
  write(dir, 'page.html', PAGE);
  const r = run(dir, 'baseline', 'page.html', '--sample', '0');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(dir).sort(), ['page.html', BASELINE.name]);
  assert.doesNotMatch(r.stderr, /deprecated/);
});

test('init in an empty directory writes the new names only', () => {
  const dir = scratch();
  const r = run(dir, 'init', '--pack', 'instrument');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(readdirSync(dir).sort(), [DIR.name, CONFIG.name]);
  assert.equal(JSON.parse(readFileSync(join(dir, CONFIG.name), 'utf8')).system, `${DIR.name}/system.json`);
  assert.ok(existsSync(join(dir, DIR.name, 'system.json')));
  assert.doesNotMatch(r.stderr, /deprecated/);
});

test('an existing config under the new name is updated in place by init', () => {
  const dir = scratch();
  write(dir, CONFIG.name, { rules: { spacing: 'warn' } });
  const r = run(dir, 'init', '--pack', 'instrument');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, CONFIG.name), 'utf8')), { rules: { spacing: 'warn' }, system: `${DIR.name}/system.json` });
  assert.deepEqual(readdirSync(dir).sort(), [DIR.name, CONFIG.name]);
});

test('init in a project with a config under the old name is refused, and writes nothing', () => {
  const dir = scratch();
  const old = `${JSON.stringify({ rules: { measure: 'warn' }, baseline: 'kept.json' }, null, 1)}\n`;
  write(dir, OLD.config, old);
  const r = run(dir, 'init', '--pack', 'instrument');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.equal(r.stderr, `standards: ${OLD.config} is no longer read: rename it to ${CONFIG.name}\n`);
  assert.deepEqual(readdirSync(dir), [OLD.config], 'nothing is written, and the old file is neither deleted nor rewritten');
  assert.equal(readFileSync(join(dir, OLD.config), 'utf8'), old);
});
