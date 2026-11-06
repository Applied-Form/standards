/**
 * The guard for the names Standards 5.0.0 removed (decision 0029). The old names are not read, and a
 * command that finds one in use stops with exit 2 and one line that names the replacement: a check
 * that quietly examined the wrong system, or no config at all, would be a pass that measured nothing.
 * The guard is `src/lib/removed-names.mjs`. It is not a shim: nothing of the old name is honoured.
 *
 * This file spells the old names on purpose.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removedNames } from '../src/lib/removed-names.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const STANDARDS = join(root, 'bin/standards.mjs');
const MCP = join(root, 'scripts/mcp.mjs');
const scratch = () => mkdtempSync(join(tmpdir(), 'standards-removed-'));
const clean = () => { const e = { ...process.env }; for (const k of ['AF_BRAND', 'AF_CHROMIUM', 'STANDARDS_SYSTEM']) delete e[k]; return e; };
const run = (file, args, { cwd = scratch(), env = {} } = {}) => spawnSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', env: { ...clean(), ...env } });

test('removedNames names each removed variable that is set, with its replacement, and nothing for the current ones', () => {
  assert.deepEqual(removedNames({ AF_BRAND: 'x' }, scratch()), ['AF_BRAND is no longer read: use STANDARDS_SYSTEM']);
  assert.deepEqual(removedNames({ AF_CHROMIUM: '/c' }, scratch()), ['AF_CHROMIUM is no longer read: use STANDARDS_CHROMIUM']);
  assert.equal(removedNames({ AF_BRAND: '' }, scratch()).length, 1, 'a defined but empty value is still set');
  assert.equal(removedNames({ AF_BRAND: 'a', AF_CHROMIUM: 'b' }, scratch()).length, 2, 'every one is named');
  assert.deepEqual(removedNames({ STANDARDS_SYSTEM: 'x', STANDARDS_CHROMIUM: '/c' }, scratch()), []);
  assert.deepEqual(removedNames({}, scratch()), []);
});

test('removedNames names an old file or directory that has no new one beside it', () => {
  for (const [old, now, make] of [['af.config.json', 'standards.config.json', 'file'], ['af-baseline.json', 'standards-baseline.json', 'file'], ['.af', '.standards', 'dir']]) {
    const dir = scratch();
    if (make === 'file') writeFileSync(join(dir, old), '{}\n'); else mkdirSync(join(dir, old));
    const shown = make === 'dir' ? ['.af/', '.standards/'] : [old, now];
    assert.deepEqual(removedNames({}, dir), [`${shown[0]} is no longer read: rename it to ${shown[1]}`], old);
    if (make === 'file') writeFileSync(join(dir, now), '{}\n'); else mkdirSync(join(dir, now));
    assert.deepEqual(removedNames({}, dir), [], `${old} beside ${now}: the project has moved, so the old one is only left over`);
  }
});

test('standards exits 2 with one line and nothing on stdout when AF_BRAND or AF_CHROMIUM is set', () => {
  for (const [name, replacement] of [['AF_BRAND', 'STANDARDS_SYSTEM'], ['AF_CHROMIUM', 'STANDARDS_CHROMIUM']]) {
    const r = run(STANDARDS, ['rules', '--json'], { env: { [name]: '/x' } });
    assert.equal(r.status, 2, `${name}: ${r.stdout.slice(0, 80)}${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, `standards: ${name} is no longer read: use ${replacement}\n`);
  }
  const empty = run(STANDARDS, ['rules', '--json'], { env: { AF_BRAND: '' } });
  assert.equal(empty.status, 2, 'AF_BRAND set and empty is still refused');
});

test('standards mcp exits 2 before it answers anything when an old name is in use, and so does the server script run directly', () => {
  for (const [file, args] of [[STANDARDS, ['mcp', '--selftest']], [MCP, ['--selftest']]]) {
    const r = run(file, args, { env: { AF_CHROMIUM: '/x' } });
    assert.equal(r.status, 2, `${file}: ${r.stdout}${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, 'standards: AF_CHROMIUM is no longer read: use STANDARDS_CHROMIUM\n');
  }
  const dir = scratch();
  writeFileSync(join(dir, 'af.config.json'), '{}\n');
  const files = run(STANDARDS, ['mcp', '--selftest'], { cwd: dir });
  assert.equal(files.status, 2);
  assert.equal(files.stderr, 'standards: af.config.json is no longer read: rename it to standards.config.json\n');
});

test('standards exits 2 in a project that still has af.config.json, af-baseline.json or .af/ and no new name', () => {
  for (const [old, now, make] of [['af.config.json', 'standards.config.json', 'file'], ['af-baseline.json', 'standards-baseline.json', 'file'], ['.af', '.standards', 'dir']]) {
    const dir = scratch();
    if (make === 'file') writeFileSync(join(dir, old), '{ "rules": { "contrast": "warn" } }\n'); else mkdirSync(join(dir, old));
    const r = run(STANDARDS, ['rules', '--json'], { cwd: dir });
    assert.equal(r.status, 2, `${old}: ${r.stderr}`);
    assert.equal(r.stdout, '');
    const shown = make === 'dir' ? [`${old}/`, `${now}/`] : [old, now];
    assert.equal(r.stderr, `standards: ${shown[0]} is no longer read: rename it to ${shown[1]}\n`);
    assert.deepEqual(readdirSync(dir), [old], 'nothing is written, renamed or deleted');
  }
});

test('with the new names in place an old file beside them is left alone and nothing is said', () => {
  const dir = scratch();
  writeFileSync(join(dir, 'af.config.json'), '{}\n');
  writeFileSync(join(dir, 'standards.config.json'), '{}\n');
  const r = run(STANDARDS, ['rules', '--json'], { cwd: dir });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '');
  assert.equal(readFileSync(join(dir, 'af.config.json'), 'utf8'), '{}\n');
});

test('the guard is one small module: no other file under bin, scripts or src names a removed variable', () => {
  const owners = [];
  for (const dir of ['bin', 'scripts', 'src/lib']) {
    for (const f of readdirSync(join(root, dir)).filter((n) => n.endsWith('.mjs'))) {
      if (/AF_BRAND\b|AF_CHROMIUM\b/.test(readFileSync(join(root, dir, f), 'utf8'))) owners.push(`${dir}/${f}`);
    }
  }
  // env.mjs and names.mjs only say in a comment that the names are gone.
  assert.deepEqual(owners.filter((f) => !['src/lib/env.mjs', 'src/lib/names.mjs', 'src/lib/removed-names.mjs'].includes(f)), []);
  assert.ok(owners.includes('src/lib/removed-names.mjs'));
});
