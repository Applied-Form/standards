/**
 * The gate as tools. The point of these tests is not that JSON-RPC works; it is that a model
 * calling standards_lint is told what is wrong *and what to change*, because that is the whole argument
 * for a loop over a paragraph of rules.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, TOOLS, HANDLERS, SERVER, closeBrowser } from '../src/lib/mcp.mjs';
import { RULES } from '../src/lib/rules/registry.mjs';
import { CLIENT_KEY } from '../src/lib/names.mjs';

const call = (name, args = {}) => handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
const payload = (r) => JSON.parse(r.result.content[0].text);

test('the server introduces itself and lists its tools', async () => {
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  assert.equal(init.result.serverInfo.name, CLIENT_KEY);
  assert.ok(init.result.capabilities.tools);
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(list.result.tools.map((t) => t.name).sort(),
    ['standards_brand', 'standards_contrast', 'standards_drift', 'standards_fix', 'standards_lint', 'standards_move', 'standards_rules', 'standards_system', 'standards_tokens']);
  for (const t of list.result.tools) {
    assert.ok(t.description.length > 40, `${t.name} explains itself`);
    assert.equal(t.inputSchema.type, 'object');
  }
});

test('it serves the gate, not the ruleset: nothing here re-serves a system', () => {
  // Applied-Form/standards-schema already serves what a system *is*. A second server doing the same job
  // would be two sources of truth for one answer. These tools answer whether an artefact obeys.
  const names = TOOLS.map((t) => t.name);
  assert.ok(names.includes('standards_lint'), 'measuring is the reason this exists');
  assert.ok(!names.some((n) => /get_system|list_systems|instruction/.test(n)));
});

test('no tool description calls the product "the engine": it is Standards', () => {
  for (const t of TOOLS) assert.doesNotMatch(t.description, /\bengine\b/i, t.name);
});

test('standards_rules returns the fix beside every rule', async () => {
  const rules = payload(await call('standards_rules', { group: 'absence' }));
  assert.ok(rules.length >= 3);
  for (const r of rules) {
    assert.equal(r.group, 'absence');
    assert.ok(r.fix, `${r.id} carries its fix`);
  }
  const wcagOnly = payload(await call('standards_rules', { wcag: true }));
  assert.ok(wcagOnly.every((r) => r.wcag.length > 0));
  assert.ok(wcagOnly.length < RULES.length, 'most rules are house style with no WCAG basis');
});

test('standards_contrast measures, and says which number is the gate', async () => {
  const r = payload(await call('standards_contrast', { foreground: '#8A3B1C', background: '#FFFFFF' }));
  assert.equal(r.ratio, 7.71);
  assert.equal(r.passes, true);
  assert.match(r.note, /WCAG 2 is the gate/);
  const bad = payload(await call('standards_contrast', { foreground: '#C98C5C', background: '#FFFFFF', sizePx: 14 }));
  assert.equal(bad.passes, false);
});

test('standards_brand refuses a palette it cannot make work, rather than emitting one', async () => {
  const good = payload(await call('standards_brand', { hue: 210, paper: '#F4F7FA' }));
  assert.ok(good.derived.primary, 'a workable hue derives');
  const bad = payload(await call('standards_brand', { hue: 210, paper: '#333333' }));
  assert.ok(bad.refused, 'a paper too dark to build on is refused');
});

test('standards_tokens hands over values instead of letting a model guess one', async () => {
  const all = payload(await call('standards_tokens'));
  assert.ok(all.colour.terracotta, 'the palette');
  assert.deepEqual(all.absent, ['shadow', 'gradient-fill', 'radius']);
  const one = payload(await call('standards_tokens', { group: 'floors' }));
  assert.equal(one.floors.maxMeasureCh, 66);
});

test('standards_move hands over one recipe, not the whole table', async () => {
  const list = payload(await call('standards_move'));
  assert.ok(list.moves.includes('colossus'));
  assert.match(list.note, /One move is active per artefact/);
  const one = payload(await call('standards_move', { name: 'colossus' }));
  assert.equal(one.recipe.ground, 'paper');
  const missing = payload(await call('standards_move', { name: 'nope' }));
  assert.match(missing.error, /no move named nope/);
});

test('standards_system imports a foreign pack through the same path the CLI uses', async () => {
  const { readFileSync } = await import('node:fs');
  const pack = JSON.parse(readFileSync(new URL('./fixtures/instrument.tokens.json', import.meta.url), 'utf8'));
  const r = payload(await call('standards_system', { pack }));
  assert.equal(r.imported, true);
  assert.equal(r.overlay.color.terracotta.$value.hex, '#C8102E');
  assert.ok(r.report.carried.some((c) => /no display voice/.test(c)));
});

test('an unknown tool is an error; a failing tool is a result the model can act on', async () => {
  const unknown = await handle({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'standards_nope' } });
  assert.equal(unknown.error.code, -32602);
  const broken = await call('standards_lint', {});
  assert.equal(broken.result.isError, true, 'a tool that cannot run says so in its result');
  assert.match(JSON.parse(broken.result.content[0].text).error, /needs html or url/);
  const unknownMethod = await handle({ jsonrpc: '2.0', id: 10, method: 'nope' });
  assert.equal(unknownMethod.error.code, -32601);
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null, 'a notification gets no reply');
});

test('standards_lint measures a draft and returns the fix for every violation', { skip: process.env.STANDARDS_SKIP_BROWSER ? 'browser skipped' : false }, async () => {
  // The loop, end to end: a page with three deliberate mistakes goes in, and what comes back is
  // actionable rather than merely true.
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Draft</title>
    <style>body{font-family:system-ui;background:#FFFFFF;color:#1B1716}a{text-decoration:none;color:#B0502E}
    .card{border-radius:9px;box-shadow:0 2px 8px rgba(0,0,0,.2);padding:11px}</style></head>
    <body><h1>Quarterly review</h1><p>See the <a href="/detail">detail</a>.</p>
    <div class="card">A card that reaches for effects this system declares absent.</div></body></html>`;
  let result;
  try {
    const raw = await HANDLERS.standards_lint({ html, register: 'ii', viewports: [1280] });
    result = JSON.parse(raw.content[0].text);
  } catch (e) {
    if (/executable|browser|Chromium/i.test(e.message)) return;
    throw e;
  }
  assert.equal(result.clean, false);
  const found = new Set(result.violations.map((v) => v.rule));
  for (const rule of ['radius-present', 'shadow-present', 'link-not-underlined']) {
    assert.ok(found.has(rule), `${rule} was measured`);
  }
  for (const v of result.violations) assert.ok(v.fix, `${v.rule} came back with its fix`);
  assert.match(result.note, /Do not lower a floor to pass/);
  assert.equal(result.register, 'ii');
  assert.equal(result.assumedRegister, true, 'the draft declared none, so the requested one was assumed');
});

test('standards_lint says which register it used when the page overrides the one asked for', { skip: process.env.STANDARDS_SKIP_BROWSER ? 'browser skipped' : false }, async () => {
  const url = new URL('./fixtures/clean.html', import.meta.url).href;
  let result;
  try {
    result = JSON.parse((await HANDLERS.standards_lint({ url, register: 'i', viewports: [1280] })).content[0].text);
  } catch (e) {
    if (/executable|browser|Chromium/i.test(e.message)) return;
    throw e;
  }
  assert.equal(result.register, 'ii', 'the page declares II and keeps it');
  assert.equal(result.assumedRegister, false);
});

test('standards_fix returns the fixed draft and an account of it, and calls no model', { skip: process.env.STANDARDS_SKIP_BROWSER ? 'browser skipped' : false }, async () => {
  // The same three mistakes standards_lint finds above, plus a heading that skips levels, which needs a
  // change to the markup and so must come back as still failing, named by its element.
  const html = `<!doctype html><html lang="en" data-register="ii"><head><meta charset="utf-8"><title>Draft</title>
    <style>.card{border-radius:9px;box-shadow:0 2px 8px rgba(0,0,0,.2)} p a.plain{text-decoration:none}</style></head>
    <body><main><h1>Quarterly review</h1><p class="card">See the <a class="plain" href="#detail">detail</a>.</p>
    <h4>Skipped</h4></main></body></html>`;
  let result;
  try {
    result = JSON.parse((await HANDLERS.standards_fix({ html, viewports: [1280] })).content[0].text);
  } catch (e) {
    if (/executable|browser|Chromium/i.test(e.message)) return;
    throw e;
  }
  for (const rule of ['radius-present', 'shadow-present', 'link-not-underlined']) assert.ok(result.fixed.includes(rule), `${rule} fixed: ${result.fixed}`);
  assert.match(result.html, /<style data-af-fixes>/);
  assert.ok(result.html.includes('<h4>Skipped</h4>'), 'the markup is the draft\'s own');
  assert.equal(result.passed, false);
  const left = result.remaining.find((v) => v.rule === 'heading-order');
  assert.ok(left?.selectors.some((s) => /h4:nth-of-type\(1\)$/.test(s)), JSON.stringify(result.remaining));
  assert.ok(result.applied.every((a) => a.selector && a.declarations));
  assert.equal(result.notChecked.doc, 'docs/accessibility-scope.md');
  // Through the protocol, the same answer.
  const viaRpc = payload(await call('standards_fix', { html, viewports: [1280] }));
  assert.deepEqual(viaRpc.fixed, result.fixed);
});

test('standards_fix takes a draft, never a url, and says why', async () => {
  for (const args of [{ url: 'file:///etc/hosts' }, { url: 'https://example.com/', html: '<p>x</p>' }]) {
    const r = await call('standards_fix', args);
    assert.equal(r.result.isError, true);
    assert.match(payload(r).error, /html only, never a url/);
  }
  const none = await call('standards_fix', {});
  assert.equal(none.result.isError, true);
  assert.match(payload(none).error, /needs html/);
});

test('standards_drift measures a system that is not this one', { skip: process.env.STANDARDS_SKIP_BROWSER ? 'browser skipped' : false }, async () => {
  // The pages an agent is handed will not be built to this system, so the tool that reads them
  // must not assume any of its vocabulary. This is the stand-in client site from the drift tests.
  const page = (extra) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Client</title>
    <style>body{background:#FFFFFF;color:#222222;font-family:Georgia,serif;font-size:16px;margin:0;padding:24px}
    h1{font-size:25px;margin-bottom:16px}a{color:#B0502E}.t{color:#B0512E}${extra}</style></head>
    <body><h1>Northwind</h1>
    <p>Measured rather than asserted. <a href="#x">How we work, and why the intervals are published beside every number we report</a>.</p>
    <p><span class="t">Provisional.</span></p></body></html>`;
  let report;
  try {
    const raw = await HANDLERS.standards_drift({ html: [page(''), page('p{margin-bottom:16px}')] });
    report = JSON.parse(raw.content[0].text);
  } catch (e) {
    if (/executable|browser|Chromium/i.test(e.message)) return;
    throw e;
  }
  const values = report.system.colour.tokens.map((t) => t.value);
  assert.ok(values.includes('#B0502E'), `the accent survives a full-page ground: ${JSON.stringify(values)}`);
  // The invariant is that the two are collapsed into one token and one near-miss. Which of them
  // is named the token follows weight, so it is the accent here only because the accent carries
  // more text; a site that used the typo more heavily would have them the other way round, and
  // the report cannot know which was intended.
  const pair = ['#B0502E', '#B0512E'];
  const named = [...values, ...report.system.colour.nearMisses.map((m) => m.value)];
  for (const c of pair) assert.ok(named.includes(c), `${c} accounted for: ${JSON.stringify(named)}`);
  assert.equal(values.filter((v) => pair.includes(v)).length, 1, 'one colour, not two tokens');
  assert.ok(report.system.colour.nearMisses.some((m) => m.value === '#B0512E'), 'the indistinguishable duplicate is named');
  assert.ok(report.findings.every((f) => /\d/.test(f)), 'every finding carries a measurement');
  assert.match(report.note, /Waste is the number to read first/);
});

test('standards_drift refuses to invent a system from nothing', async () => {
  const r = await call('standards_drift', {});
  assert.equal(r.result.isError, true);
  assert.match(payload(r).error, /needs html or urls/);
});

test('one browser serves the whole session, because the loop is the point', { skip: process.env.STANDARDS_SKIP_BROWSER ? 'browser skipped' : false }, async () => {
  // The first version launched and destroyed a Chromium per call, paying startup on every turn of
  // the draft-lint-fix-lint cycle this server exists for. Two calls must share one browser.
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><p>Short.</p></body></html>';
  try {
    const first = await HANDLERS.standards_lint({ html, register: 'ii', viewports: [1280] });
    const second = await HANDLERS.standards_lint({ html, register: 'ii', viewports: [1280] });
    assert.ok(JSON.parse(first.content[0].text).widths.length === 1);
    assert.ok(JSON.parse(second.content[0].text).widths.length === 1);
  } catch (e) {
    if (/executable|browser|Chromium/i.test(e.message)) return;
    throw e;
  }
});

test('the server version moves when its tool surface does', () => {
  // A client caches a tool list. Adding a tool without moving the version is how it never notices.
  assert.match(SERVER.version, /^\d+\.\d+\.\d+$/);
  assert.ok(SERVER.version !== '3.0.0', 'the drift tool was added after 3.0.0');
});

test('the registry manifest cannot drift from the package or the server', async () => {
  // Three files carry this version and a client caches the tool list keyed on it. Left to
  // hand-editing, one of the three is always stale.
  const { readFileSync } = await import('node:fs');
  const at = (f) => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
  const [manifest, pkg] = [at('server.json'), at('package.json')];
  assert.equal(manifest.version, SERVER.version, 'server.json is behind src/lib/mcp.mjs');
  assert.equal(manifest.packages[0].version, SERVER.version, 'the npm package entry is behind');
  // The blind spot the first version of this test had. Comparing the manifest only against
  // SERVER.version let both of them run ahead of package.json together: server.json advertised
  // 3.1.0 while the package was still 3.0.0, so the registry entry pointed at an npm version that
  // did not exist. The manifest's package version is a claim about npm, and npm is package.json.
  assert.equal(manifest.packages[0].version, pkg.version, 'the manifest points at an npm version that is not the one this package publishes');
  assert.equal(SERVER.version, pkg.version, 'the server ships inside the package, so it cannot be versioned apart from it');
  assert.equal(manifest.packages[0].identifier, pkg.name, 'the manifest points at a package that is not this one');
  assert.deepEqual(Object.keys(pkg.bin), ['standards'], 'one bin serves the server, as `standards mcp`: the af-mcp bin was removed in 5.0.0');
  // The last namespace segment can be a GitHub organisation, whose capitals the registry keeps.
  assert.match(manifest.name, /^[a-z]+\.[a-z0-9-]+(\.[A-Za-z0-9-]+)*\/[a-z0-9-]+$/, 'reverse-DNS namespace');
  // The registry validates against its schema, which caps both at 100 characters, and checks npm
  // ownership by the package's mcpName matching the server's name.
  assert.ok(manifest.description.length <= 100, `description is ${manifest.description.length} characters; the schema allows 100`);
  assert.ok(manifest.title.length <= 100);
  assert.equal(pkg.mcpName, manifest.name, 'package.json mcpName must match the server name or the registry refuses ownership');
});

// The names (decision 0029). The tools are `standards_*`. The `af_*` names were accepted for one major
// version and were removed in 5.0.0: they are not listed, not answered, and say nothing on stderr.
// This block spells them on purpose, to prove that.
const OLD = ['af_lint', 'af_fix', 'af_rules', 'af_tokens', 'af_contrast', 'af_brand', 'af_move', 'af_system', 'af_drift'];
const NEW = OLD.map((n) => n.replace(/^af_/, 'standards_'));

test('the list is the nine standards_* tools, and no af_* name is in it', async () => {
  const r = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.deepEqual(r.result.tools.map((t) => t.name).sort(), [...NEW].sort());
  for (const old of OLD) assert.ok(!r.result.tools.some((t) => t.name === old), `${old} is not listed`);
  assert.ok(JSON.stringify(r.result).length < 4615 * 1.1, 'the list is no larger than it was before the rename');
});

test('a call under an af_* name is refused as an unknown tool, with nothing else in the answer', async () => {
  for (const old of OLD) {
    const r = await call(old, { foreground: '#1A1A1A', background: '#FFFFFF' });
    assert.equal(r.error?.code, -32602, `${old}: ${JSON.stringify(r)}`);
    assert.equal(r.error.message, `unknown tool: ${old}`);
    assert.equal(r.result, undefined, `${old} reaches no handler`);
  }
  const current = await call('standards_contrast', { foreground: '#1A1A1A', background: '#FFFFFF' });
  assert.equal(current.result.content.length, 1, 'the new name carries one item and no notice');
});

test('a profile argument is not read: the list is the same whatever is passed', async () => {
  const [a, b] = await Promise.all([handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { legacy: true })]);
  assert.deepEqual(b, a);
});

test('an unknown name is -32602, including names every object has', async () => {
  for (const name of ['standards_nope', 'af_nope', 'nope', 'constructor', 'toString', '__proto__', 'af_', 'standards_']) {
    const r = await call(name, {});
    assert.equal(r.error?.code, -32602, `${name}: ${JSON.stringify(r)}`);
  }
});

test('an error names the tool the caller used', async () => {
  const cases = [
    ['standards_lint', {}, /standards_lint needs html or url/],
    ['standards_fix', {}, /standards_fix needs html/],
    ['standards_fix', { url: 'file:///etc/hosts' }, /standards_fix takes html only/],
    ['standards_drift', {}, /standards_drift needs html or urls/],
  ];
  for (const [name, args, message] of cases) {
    const r = await call(name, args);
    assert.equal(r.result.isError, true, name);
    assert.match(payload(r).error, message, name);
  }
  await assert.rejects(HANDLERS.standards_lint({}), /standards_lint needs html or url/, 'a direct call names the tool by its current name');
});

test('release the browser', async () => {
  await closeBrowser();
});
