/**
 * What the product's names promise. Standards by Applied Form is the command `standards`, and its
 * system and Chromium are chosen by `STANDARDS_SYSTEM` and `STANDARDS_CHROMIUM`. The older `af`,
 * `af-mcp`, `AF_BRAND` and `AF_CHROMIUM` were removed in 5.0.0 (decision 0029): this is one of the
 * files allowed to spell them, to prove that they do nothing now.
 *
 * It uses only files the open export carries (fixtures by path, never brands/), so the open
 * repository runs it too.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, copyFileSync, readFileSync, readdirSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from '../src/lib/page-lint.mjs';
import { isReport } from '../src/lib/audit-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const STANDARDS = join(root, 'bin/standards.mjs');
const FIXTURES = join(root, 'test/fixtures');

let browser = null, launchError = null;
try { browser = await launchBrowser(); } catch (e) { launchError = e; if (process.env.CI) throw e; }
const skip = browser ? false : `no Chromium: ${launchError?.message.split('\n')[0]}`;
await browser?.close();

// A run starts with no system of either spelling and no old Chromium name; a test sets the ones it is about. The
// person's own STANDARDS_CHROMIUM stays, so that a child finds the browser this file found.
const env = () => { const e = { ...process.env }; for (const k of ['AF_BRAND', 'STANDARDS_SYSTEM', 'AF_CHROMIUM']) delete e[k]; return e; };
const run = (bin, args = []) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: env() });

test('standards rules --json writes JSON and nothing to stderr; an unknown command exits 2, and bare standards exits 0', () => {
  const now = run(STANDARDS, ['rules', '--json']);
  assert.equal(now.status, 0, now.stderr);
  assert.doesNotThrow(() => JSON.parse(now.stdout));
  assert.equal(now.stderr, '', 'the command prints nothing to stderr');
  const nope = run(STANDARDS, ['nope']);
  assert.equal(nope.status, 2);
  assert.equal(nope.stdout, '');
  assert.match(nope.stderr, /^usage: standards </);
  const bare = run(STANDARDS);
  assert.equal(bare.status, 0, 'bare standards prints usage and exits 0');
  assert.match(bare.stderr, /^usage: standards </);
});

test('standards mcp --selftest passes, calling the tools by the names the server lists, with nothing on stderr', () => {
  const now = run(STANDARDS, ['mcp', '--selftest']);
  assert.equal(now.status, 0, now.stdout + now.stderr);
  assert.match(now.stdout.trim().split('\n').pop(), /protocol clean$/);
  assert.match(now.stdout, /standards_rules/);
  assert.equal(now.stderr, '');
});

/**
 * A real stdio session: write the messages, close stdin, and read what the server said. The
 * selftest prints for a person by design, so it cannot show that stdout is protocol and nothing
 * else; this can.
 */
const session = (bin, args, messages) => new Promise((resolve, reject) => {
  const p = spawn(process.execPath, [bin, ...args], { env: env(), stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  const timer = setTimeout(() => { p.kill(); reject(new Error(`no answer in 60s: ${out}${err}`)); }, 60000);
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('error', reject);
  p.on('close', (status) => { clearTimeout(timer); resolve({ status, out, err, lines: out.split('\n').filter(Boolean) }); });
  for (const m of messages) p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...m })}\n`);
  p.stdin.end();
});
const hello = [
  { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'compat', version: '0' } } },
  { id: 2, method: 'tools/list', params: {} },
];

test('a stdio session over standards mcp is clean protocol and lists the standards_* tools', async () => {
  const r = await session(STANDARDS, ['mcp'], hello);
  assert.equal(r.status, 0, r.err);
  assert.equal(r.lines.length, 2, 'one answer for initialize and one for tools/list');
  for (const line of r.lines) assert.equal(JSON.parse(line).jsonrpc, '2.0', line);
  const tools = JSON.parse(r.lines[1]).result.tools.map((t) => t.name);
  assert.equal(tools.length, 9);
  for (const name of tools) assert.match(name, /^standards_/);
  assert.equal(r.err, '');
});

test('a call under an af_* name over stdio is an unknown tool, and nothing is written to stderr', async () => {
  const call = (id) => ({ id, method: 'tools/call', params: { name: 'af_contrast', arguments: { foreground: '#1A1A1A', background: '#FFFFFF' } } });
  const r = await session(STANDARDS, ['mcp'], [...hello, call(3)]);
  assert.equal(r.status, 0, r.err);
  assert.equal(JSON.parse(r.lines[2]).error.message, 'unknown tool: af_contrast');
  assert.equal(r.err, '');
});

test('the legacy tool-list argument is not read: standards mcp lists the standards_* tools whatever it is given', async () => {
  const r = await session(STANDARDS, ['mcp', '--legacy-tool-names'], hello);
  assert.equal(r.status, 0, r.err);
  assert.ok(JSON.parse(r.lines[1]).result.tools.every((t) => t.name.startsWith('standards_')));
  assert.equal(r.err, '');
});

test('the old commands af and af-mcp are not in the tree', () => {
  for (const file of ['bin/af.mjs', 'bin/af-mcp.mjs']) assert.equal(existsSync(join(root, file)), false, file);
});

test('a report is recognised by any of the three generator values it has carried', () => {
  const page = (generator) => `<!doctype html><html><head><meta charset="utf-8"><meta name="generator" content="${generator}"><title>r</title></head><body></body></html>`;
  for (const generator of ['standards audit', 'af audit', 'af report']) assert.equal(isReport(page(generator)), true, generator);
  assert.equal(isReport(page('something else')), false);
  assert.equal(isReport('<!doctype html><title>a page of the set</title>'), false);
});

test('lint --json writes nothing but JSON to stdout, with the sampled widths left to stderr', { skip }, () => {
  // The line that names the two sampled widths used to go to stdout, so `lint --json` was not
  // parseable unless --sample 0 was given. The run is not given --sample 0 here.
  const r = run(STANDARDS, ['lint', join(FIXTURES, 'clean.html'), '--json']);
  assert.doesNotThrow(() => JSON.parse(r.stdout), `stdout is not JSON: ${r.stdout.slice(0, 200)}`);
  assert.match(r.stderr, /sampled widths \d+, \d+px \(--seed \d+ to reproduce\)/);
});

/**
 * The environment names. `STANDARDS_SYSTEM` and `STANDARDS_CHROMIUM` are the only ones read, on every use.
 * `AF_BRAND` and `AF_CHROMIUM` were removed in 5.0.0. The system is `test/fixtures/rounded.tokens.json`,
 * a fixture the open export carries, never a name under brands/.
 */
const ROUNDED = join(FIXTURES, 'rounded.tokens.json');
const runWith = (bin, args, set, cwd = root) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...env(), ...set }, cwd });
const scratch = () => mkdtempSync(join(tmpdir(), 'standards-compat-'));
const child = (code, set = {}) => spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', env: { ...env(), ...set }, cwd: root });
const href = (rel) => JSON.stringify(pathToFileURL(join(root, rel)).href);
// The verdict on the page, without the line that says which config file was read: that differs by design.
const verdict = (r) => { const { config, ...rest } = JSON.parse(r.stdout); return rest; };
const lintArgs = ['lint', join(FIXTURES, 'violations.html'), '--json', '--sample', '0'];

// The system a process loads its tokens for: tokens.mjs reads it when it is imported.
const systemOf = (set) => {
  const r = child(`const { brand } = await import(${href('src/lib/tokens.mjs')}); console.log(JSON.stringify(brand));`, set);
  assert.equal(r.status, 0, r.stderr);
  return { brand: JSON.parse(r.stdout), stderr: r.stderr };
};

test('STANDARDS_SYSTEM names the system, with nothing on stderr; the library does not read AF_BRAND (the command refuses it: test/removed-names.test.mjs)', () => {
  assert.deepEqual(systemOf({ STANDARDS_SYSTEM: ROUNDED }), { brand: ROUNDED, stderr: '' });
  assert.deepEqual(systemOf({ AF_BRAND: ROUNDED }), { brand: null, stderr: '' }, 'the old name chooses nothing, and says nothing');
  assert.deepEqual(systemOf({}), { brand: null, stderr: '' });
});

test('STANDARDS_SYSTEM judges a page against the system it names; AF_BRAND is refused, not used', { skip }, () => {
  const house = runWith(STANDARDS, lintArgs, {}, scratch());
  const now = runWith(STANDARDS, lintArgs, { STANDARDS_SYSTEM: ROUNDED });
  const old = runWith(STANDARDS, lintArgs, { AF_BRAND: ROUNDED });
  assert.doesNotThrow(() => JSON.parse(now.stdout), now.stderr);
  assert.notEqual(now.stdout, house.stdout, 'the fixture system changes the verdict, so the variable was read');
  assert.equal(now.stderr.includes('deprecated'), false);
  assert.equal(old.status, 2, 'the old name is not a way to name a system, and is not a quiet pass either');
  assert.equal(old.stdout, '');
});

test('both names set to different values: the library uses the new one and does not look at the old; the command refuses the old one', () => {
  const other = '/no/such/system.tokens.json'; // the old name's value is never opened, so it need not exist
  assert.deepEqual(systemOf({ AF_BRAND: other, STANDARDS_SYSTEM: ROUNDED }), { brand: ROUNDED, stderr: '' });
  const r = runWith(STANDARDS, ['rules', '--json'], { AF_BRAND: other, STANDARDS_SYSTEM: ROUNDED });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'standards: AF_BRAND is no longer read: use STANDARDS_SYSTEM\n');
});

test("STANDARDS_SYSTEM='' is a value: the house system, with no config read", { skip }, () => {
  assert.deepEqual(systemOf({ STANDARDS_SYSTEM: '' }), { brand: null, stderr: '' });
  const dir = scratch();
  writeFileSync(join(dir, 'standards.config.json'), JSON.stringify({ system: ROUNDED }));
  const house = runWith(STANDARDS, lintArgs, {}, scratch());
  const configured = runWith(STANDARDS, lintArgs, {}, dir);
  const empty = runWith(STANDARDS, lintArgs, { STANDARDS_SYSTEM: '' }, dir);
  assert.notDeepEqual(verdict(configured), verdict(house), 'the config alone would have chosen the fixture system');
  assert.deepEqual(verdict(empty), verdict(house), 'an empty value is the house system, so the config is not read');
});

test('standards fix, which runs a script of its own, takes STANDARDS_SYSTEM through and says nothing about it', { skip }, () => {
  const dir = scratch();
  const page = join(dir, 'page.html');
  copyFileSync(join(FIXTURES, 'violations.html'), page);
  const r = runWith(STANDARDS, ['fix', page, '--out', join(dir, 'out.html'), '--sample', '0'], { STANDARDS_SYSTEM: ROUNDED }, dir);
  assert.doesNotMatch(r.stderr, /deprecated/, r.stderr);
});

test('STANDARDS_CHROMIUM names the browser; AF_CHROMIUM is refused, not used', () => {
  const bad = join(scratch(), 'no-such-chromium');
  const args = ['lint', join(FIXTURES, 'clean.html'), '--sample', '0'];
  const now = runWith(STANDARDS, args, { STANDARDS_CHROMIUM: bad });
  assert.notEqual(now.status, 0);
  assert.ok(now.stderr.includes(bad), `the executable that was asked for is named: ${now.stderr.slice(0, 300)}`);
  const old = runWith(STANDARDS, args, { AF_CHROMIUM: bad });
  assert.equal(old.status, 2);
  assert.equal(old.stderr, 'standards: AF_CHROMIUM is no longer read: use STANDARDS_CHROMIUM\n');
});

test('STANDARDS_SYSTEM beats a config that names another system', { skip }, () => {
  const bare = runWith(STANDARDS, lintArgs, { STANDARDS_SYSTEM: ROUNDED }, scratch());
  assert.equal(bare.status, 1, 'the fixture page has violations');
  const dir = scratch();
  writeFileSync(join(dir, 'standards.config.json'), JSON.stringify({ system: join(dir, 'a-system-that-is-not-there.json') }));
  const r = runWith(STANDARDS, lintArgs, { STANDARDS_SYSTEM: ROUNDED }, dir);
  assert.equal(r.status, bare.status, r.stderr);
  assert.deepEqual(verdict(r), verdict(bare), 'the variable wins over the config');
});

test('a write to STANDARDS_SYSTEM after env.mjs and system-arg.mjs are imported, and before the tokens are, is still read', () => {
  // eval/builders-report.mjs does exactly this. A copy taken when env.mjs was imported would judge the house system.
  const r = child(`import ${href('src/lib/system-arg.mjs')}; import ${href('src/lib/env.mjs')};
    process.env.STANDARDS_SYSTEM = ${JSON.stringify(ROUNDED)};
    const { brand } = await import(${href('src/lib/tokens.mjs')}); console.log(brand);`);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), ROUNDED);
  assert.equal(r.stderr, '');
});

test('setSystem puts the system under STANDARDS_SYSTEM and leaves an inherited AF_BRAND alone and unread', () => {
  const r = child(`const { setSystem, systemFromEnv } = await import(${href('src/lib/env.mjs')});
    setSystem('x');
    console.log(JSON.stringify({ system: systemFromEnv(), now: process.env.STANDARDS_SYSTEM, old: process.env.AF_BRAND ?? null }));`, { AF_BRAND: 'y' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { system: 'x', now: 'x', old: 'y' });
  assert.equal(r.stderr, '', 'no line and no error');
});

test('childEnv hands on this process\'s environment, applies what it is given, and leaves this process alone', () => {
  const r = child(`const { childEnv } = await import(${href('src/lib/env.mjs')});
    const e = childEnv({ KEPT: 'k', STANDARDS_SYSTEM: undefined });
    console.log(JSON.stringify({ e: Object.fromEntries(Object.entries(e).filter(([k]) => /^(AF_BRAND|AF_CHROMIUM|STANDARDS_SYSTEM|STANDARDS_CHROMIUM|KEPT)$/.test(k))), own: process.env.STANDARDS_SYSTEM }));`,
  { STANDARDS_SYSTEM: ROUNDED, STANDARDS_CHROMIUM: '/some/chromium' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.e, { STANDARDS_CHROMIUM: '/some/chromium', KEPT: 'k' }, 'undefined removes; the rest is passed on');
  assert.equal(out.own, ROUNDED, 'this process keeps what it was given');
  assert.equal(r.stderr, '');
});

test('systemFromEnv and chromiumFromEnv read the object they are given, and read only the STANDARDS_ names', async () => {
  const { systemFromEnv, chromiumFromEnv } = await import('../src/lib/env.mjs');
  const given = Object.freeze({ STANDARDS_SYSTEM: 'a', STANDARDS_CHROMIUM: '/c' });
  assert.equal(systemFromEnv(given), 'a');
  assert.equal(chromiumFromEnv(given), '/c');
  assert.equal(systemFromEnv({}), undefined);
  assert.equal(chromiumFromEnv({}), undefined);
  assert.equal(systemFromEnv({ STANDARDS_SYSTEM: '' }), '', 'a defined but empty value is a value');
  assert.equal(systemFromEnv({ AF_BRAND: 'b' }), undefined, 'AF_BRAND is not read');
  assert.equal(chromiumFromEnv({ AF_CHROMIUM: '/b' }), undefined, 'AF_CHROMIUM is not read');
  assert.equal(systemFromEnv({ STANDARDS_SYSTEM: 'a', AF_BRAND: 'b' }), 'a', 'and it is not a conflict');
});

// package.json's brand scripts read STANDARDS_SYSTEM in a shell and default to north. A shell that still
// exports AF_BRAND (the README said `AF_BRAND=lilac npm run build:brand` until 4.0.0) gets north: the old
// name is not read. `node` is a probe here: it prints the system the script's own environment resolves to,
// then the arguments.
const SCRIPTS = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;
const probeNode = () => {
  const dir = scratch();
  const probe = `import(${href('src/lib/env.mjs')}).then((m) => console.log('system=' + m.systemFromEnv() + ' ' + process.argv.slice(1).join(' ')))`;
  writeFileSync(join(dir, 'node'), `#!/bin/sh\nexec "${process.execPath}" -e "$PROBE" "$@"\n`);
  chmodSync(join(dir, 'node'), 0o755);
  return { dir, probe };
};
const script = (name, set) => {
  const { dir, probe } = probeNode();
  const r = spawnSync('/bin/sh', ['-c', SCRIPTS[name]], { encoding: 'utf8', cwd: root, env: { ...env(), PATH: `${dir}:${process.env.PATH}`, PROBE: probe, ...set } });
  return { status: r.status, out: r.stdout.trim().split('\n').map((l) => l.replace(/ scripts\/\S+/, '')), stderr: r.stderr };
};
const skipScripts = SCRIPTS['build:brand'] ? false : 'the open package has no brand scripts';

test('npm run build:brand, lint:brand and golden:brand take the system from STANDARDS_SYSTEM and default to north; AF_BRAND is not read', { skip: skipScripts }, () => {
  for (const name of ['build:brand', 'lint:brand', 'golden:brand']) {
    const fromNew = script(name, { STANDARDS_SYSTEM: 'lilac' });
    assert.equal(fromNew.status, 0, fromNew.stderr);
    assert.match(fromNew.out[0], /^system=lilac/, name);
    assert.equal(fromNew.stderr, '', name);
    assert.match(script(name, {}).out[0], /^system=north/, `${name} defaults to north`);
    const fromOld = script(name, { AF_BRAND: 'lilac' });
    assert.equal(fromOld.status, 0, `${name} under AF_BRAND=lilac: ${fromOld.stderr}`);
    assert.match(fromOld.out[0], /^system=north/, `${name} under AF_BRAND=lilac defaults to north: the old name is not read`);
    assert.equal(fromOld.stderr, '', name);
    const emptyNew = script(name, { STANDARDS_SYSTEM: '' });
    assert.match(emptyNew.out[0], /^system=north/, `${name} under an empty STANDARDS_SYSTEM defaults to north`);
  }
  assert.match(script('lint:brand', { STANDARDS_SYSTEM: 'lilac' }).out[0], /dist\/brands\/lilac\/examples\//, 'the glob follows the system');
});

test('npm run build:brands and golden:brands render every brand under its own name, whatever the shell exports', { skip: skipScripts }, () => {
  for (const name of ['build:brands', 'golden:brands']) {
    for (const set of [{}, { AF_BRAND: 'lilac' }, { STANDARDS_SYSTEM: ROUNDED }, { STANDARDS_SYSTEM: 'lilac' }]) {
      const r = script(name, set);
      assert.equal(r.status, 0, `${name} under ${JSON.stringify(set)}: ${r.stderr}`);
      assert.deepEqual(r.out.slice(0, 3).map((l) => l.split(' ')[0]), ['system=north', 'system=lilac', 'system=vellum'], `${name} under ${JSON.stringify(set)}`);
    }
  }
});

// A script that is run directly and reads the system or the Chromium variable does so through src/lib/env.mjs, which
// has no old-name fallback. Nothing in the tree that is run reads AF_BRAND or AF_CHROMIUM any more.
test('no entry point reads AF_BRAND or AF_CHROMIUM', () => {
  const offenders = [];
  for (const dir of ['bin', 'scripts', 'src/lib', 'eval']) {
    if (!existsSync(join(root, dir))) continue;
    for (const name of readdirSync(join(root, dir)).filter((f) => f.endsWith('.mjs'))) {
      if (/AF_BRAND\b|AF_CHROMIUM\b/.test(readFileSync(join(root, dir, name), 'utf8')) && !(dir === 'src/lib' && ['env.mjs', 'names.mjs', 'removed-names.mjs'].includes(name))) offenders.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(offenders, []);
});
