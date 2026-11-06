import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as names from '../src/lib/names.mjs';
import { TOOLS, HANDLERS } from '../src/lib/mcp.mjs';

// The old names were removed in 5.0.0 (decision 0029, "What 5.0.0 removes"). This file spells them on
// purpose: it checks the names module and the tree against an independent copy of what was removed,
// so deriving them from the module would make each assertion compare the module with itself. A search
// for the old names that includes test/ lists this file (and test/compat.test.mjs, test/config-files.test.mjs
// and test/mcp.test.mjs) as exempt.

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const OLD_TOOLS = ['af_lint', 'af_fix', 'af_rules', 'af_tokens', 'af_contrast', 'af_brand', 'af_move', 'af_system', 'af_drift'];

test('the names module holds the names the product has, and nothing that was removed', () => {
  assert.equal(names.COMMAND, 'standards');
  assert.equal(names.PACKAGE, '@appliedform/standards');
  assert.equal(names.CLIENT_KEY, 'standards');
  assert.deepEqual(names.CONFIG, { name: 'standards.config.json' });
  assert.deepEqual(names.BASELINE, { name: 'standards-baseline.json' });
  assert.deepEqual(names.DIR, { name: '.standards' });
  // The removal date, the deprecation line and the maps from an old name to a new one are gone with the names.
  for (const gone of ['REMOVE_IN', 'deprecated', 'TOOL_MAP', 'ENV', 'NOTED']) assert.equal(gone in names, false, `${gone} is not exported`);
});

test('the report generator and its two older values are the one old name that stays, and are distinct', () => {
  assert.equal(names.GENERATOR, 'standards audit');
  assert.deepEqual([...names.LEGACY_GENERATORS].sort(), ['af audit', 'af report']);
  assert.ok(!names.LEGACY_GENERATORS.includes(names.GENERATOR));
});

test('the package installs one bin, standards, and the old bins and their files are gone', () => {
  assert.deepEqual(pkg.bin, { standards: 'bin/standards.mjs' });
  for (const file of ['bin/af.mjs', 'bin/af-mcp.mjs', 'src/lib/env-guard.mjs', 'src/lib/resolve-file.mjs']) assert.equal(existsSync(join(ROOT, file)), false, `${file} is gone`);
  assert.deepEqual(readdirSync(join(ROOT, 'bin')), ['standards.mjs']);
  if (!existsSync(join(ROOT, 'package-lock.json'))) return; // the open export carries no lock file
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
  assert.deepEqual(lock.packages[''].bin, { standards: 'bin/standards.mjs' }, 'the lock file agrees');
});

test('the MCP server lists the standards_* tools and has no handler under an af_* name', () => {
  const listed = TOOLS.map((t) => t.name);
  assert.equal(listed.length, 9);
  for (const name of listed) assert.match(name, /^standards_[a-z]+$/);
  for (const old of OLD_TOOLS) {
    assert.ok(!listed.includes(old), `${old} is not listed`);
    assert.equal(Object.hasOwn(HANDLERS, old), false, `${old} has no handler`);
  }
  assert.deepEqual([...listed].sort(), Object.keys(HANDLERS).sort(), 'every listed tool has a handler and every handler is listed');
});

test('no script reads the old variables or the legacy tool profile, and none writes a deprecation line', () => {
  const old = /AF_BRAND\b|AF_CHROMIUM\b|--legacy-tool-names|is deprecated: use|will be removed in Standards/;
  const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
  const files = ['package.json', ...['bin', 'src', 'scripts'].flatMap((dir) => readdirSync(join(ROOT, dir), { recursive: true }).filter((f) => /\.(mjs|js|json)$/.test(f)).map((f) => `${dir}/${f}`))];
  assert.ok(files.length > 40, `only ${files.length} files searched`);
  assert.deepEqual(files.filter((f) => old.test(read(f)) && !['src/lib/env.mjs', 'src/lib/names.mjs', 'src/lib/removed-names.mjs'].includes(f)), []);
});
