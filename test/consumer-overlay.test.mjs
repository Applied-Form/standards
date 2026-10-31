/**
 * A consumer's own system, kept in the consumer's own repository: an overlay file with its own tokens
 * and its own fonts directory, outside the engine. Issues #11, #12 and #13 were each a place where the
 * engine quietly used itself instead: the lint ignored `--system`, the build wrote into the installed
 * package, and `brand.fontsDir` was read from the engine's root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../src/lib/page-lint.mjs';
import { ENV } from '../src/lib/names.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const standards = join(root, 'bin/standards.mjs');

/** A consumer repository: an overlay that permits a radius scale, with its brand fonts beside it. */
function consumer(key, brand) {
  const dir = mkdtempSync(join(tmpdir(), 'af-consumer-'));
  mkdirSync(join(dir, 'fonts'));
  writeFileSync(join(dir, 'fonts', 'consumer-sans.woff2'), 'not a real font: only its name is read');
  writeFileSync(join(dir, `${key}.tokens.json`), JSON.stringify({
    $extensions: { 'form.applied': { brand: { name: 'Consumer', ...brand }, absent: { $value: ['gradient-fill'] } } },
    radius: { $type: 'dimension', sm: { $value: { value: 4, unit: 'px' } } },
  }));
  return dir;
}
const env = (extra = {}) => {
  const e = { ...process.env };
  for (const name of [ENV.STANDARDS_SYSTEM, 'STANDARDS_SYSTEM', 'STANDARDS_OUT']) delete e[name];
  return { ...e, ...extra };
};

let browser = null, launchError = null;
try { browser = await launchBrowser(); await browser.close(); } catch (e) { launchError = e; if (process.env.CI) throw e; }
const skip = browser ? false : `no Chromium: ${launchError?.message.split('\n')[0]}`;

test('#11 standards lint --system judges the page against the overlay it names', { skip }, () => {
  const dir = consumer('consumer-lint');
  // A 4px corner is on this system's radius scale. The default system refuses every radius.
  writeFileSync(join(dir, 'page.html'), '<!doctype html><html lang="en" data-register="ii"><head><meta charset="utf-8"><title>Card</title></head><body><main><h1>Card</h1><button style="border-radius:4px">Go</button></main></body></html>');
  const out = spawnSync(process.execPath, [standards, 'lint', 'page.html', '--system', './consumer-lint.tokens.json', '--sample', '0', '--json'], { cwd: dir, env: env(), encoding: 'utf8' });
  assert.ok(out.status === 0 || out.status === 1, `lint ran: exit ${out.status}\n${out.stderr}`);
  const { pages } = JSON.parse(out.stdout);
  assert.ok(pages.length > 0, 'pages were linted');
  assert.deepEqual([...new Set(pages.map((p) => p.url.split('/').pop()))], ['page.html'], 'the overlay is the system, not a page to lint');
  const rules = new Set(pages.flatMap((p) => p.violations.map((v) => v.rule)));
  assert.ok(!rules.has('radius-present'), `judged against the default system, which refuses the radius: ${[...rules].join(', ')}`);
  assert.ok(!rules.has('radius-off-scale'), 'the radius is on the overlay scale');
});

test('#11 standards lint --system with no value, or a missing file, is a usage error', () => {
  const dir = consumer('consumer-usage');
  writeFileSync(join(dir, 'page.html'), '<!doctype html><title>t</title>');
  for (const args of [['--system'], ['--system', './nowhere.tokens.json']]) {
    const out = spawnSync(process.execPath, [standards, 'lint', 'page.html', ...args, '--sample', '0'], { cwd: dir, env: env(), encoding: 'utf8' });
    assert.equal(out.status, 2, `${args.join(' ')}: ${out.stdout}${out.stderr}`);
    assert.match(out.stderr, /--system/);
  }
});

test('#12 standards build writes where STANDARDS_OUT says, in the consumer repository, not into the engine', () => {
  const dir = consumer('consumer-build', { fontsDir: 'fonts/', fonts: [{ file: 'consumer-sans.woff2', family: 'Consumer Sans', weight: '400', style: 'normal' }] });
  const engineOut = join(root, 'dist/brands/consumer-build');
  rmSync(engineOut, { recursive: true, force: true });
  try {
    // Both paths relative to the consumer's directory, as a person types them; npm runs the build in the engine.
    const out = spawnSync(process.execPath, [standards, 'build'], { cwd: dir, env: env({ STANDARDS_SYSTEM: './consumer-build.tokens.json', STANDARDS_OUT: 'dist' }), encoding: 'utf8' });
    assert.equal(out.status, 0, out.stdout + out.stderr);
    for (const file of ['tokens.css', 'components.css', 'stylelint.config.cjs']) {
      assert.ok(existsSync(join(dir, 'dist', file)), `${file} is in the consumer's dist/`);
    }
    assert.ok(readFileSync(join(dir, 'dist', 'tokens.css'), 'utf8').startsWith('/* Consumer design system'), 'built from the consumer overlay');
    assert.ok(!existsSync(engineOut), 'nothing was written into the engine');
  } finally {
    rmSync(engineOut, { recursive: true, force: true });
  }
});

const buildCss = (dir, key) => {
  const engineOut = join(root, `dist/brands/${key}`);
  try {
    execFileSync(process.execPath, [join(root, 'scripts/build-css.mjs')], { cwd: dir, env: env({ STANDARDS_SYSTEM: join(dir, `${key}.tokens.json`) }), encoding: 'utf8' });
    return readFileSync(join(engineOut, 'tokens.css'), 'utf8');
  } finally {
    rmSync(engineOut, { recursive: true, force: true });
  }
};
const foreign = /font-family: "(Fraunces|Libre Franklin|IBM Plex Mono)"/;

test('#13 brand.fontsDir resolves against the overlay file, not the engine root', () => {
  const dir = consumer('consumer-fonts', { fontsDir: 'fonts/', fonts: [{ file: 'consumer-sans.woff2', family: 'Consumer Sans', weight: '400', style: 'normal' }] });
  const css = buildCss(dir, 'consumer-fonts');
  assert.ok(/font-family: "Consumer Sans";/.test(css), 'the brand face is read from the consumer\'s fonts/');
  assert.ok(css.includes('src: url("./fonts/consumer-sans.woff2")'), 'and served beside the built tokens.css');
  assert.ok(!foreign.test(css), 'no engine face in a brand that does not use it');
});

test('#13 a brand that lists no fonts gets no foreign @font-face rules', () => {
  const dir = consumer('consumer-nofonts');
  const css = buildCss(dir, 'consumer-nofonts');
  assert.ok(!css.includes('@font-face'), 'a brand with no fonts declares no faces');
});
