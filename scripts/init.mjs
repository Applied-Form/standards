#!/usr/bin/env node
/**
 * standards init --pack <pack tokens.json | instrument>
 *
 * Import a Standards pack and name it in standards.config.json, so every later `standards` command in this directory
 * judges pages against the pack's own rules. `instrument` is the free pack, bundled (CC BY 4.0).
 * A pack that cannot meet the floors is refused with the measurement, as `standards system import` refuses it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fromPack } from '../src/lib/pack.mjs';
import { CONFIG, DIR } from '../src/lib/names.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const which = args[args.indexOf('--pack') + 1];
if (!args.includes('--pack') || !which) { console.error('usage: standards init --pack <pack tokens.json | instrument>'); process.exit(2); }
const bundled = /^[a-z-]+$/.test(which) && !existsSync(which);
const path = bundled ? `${ROOT}packs/${which}.tokens.json` : which;
if (!existsSync(path)) { console.error(`standards init: no pack at ${which}${bundled ? ' (bundled packs: instrument)' : ''}`); process.exit(2); }

const pack = JSON.parse(readFileSync(path, 'utf8'));
const { overlay, report } = fromPack(pack, { key: bundled ? which : undefined });
if (!overlay) {
  console.error(`${pack.system ?? 'The pack'} was refused:\n  ${report.refused.join('\n  ')}\nA system that cannot meet the floors is a finding for its author.`);
  process.exit(1);
}
const config = existsSync(CONFIG.name) ? JSON.parse(readFileSync(CONFIG.name, 'utf8')) : {};
const system = `${DIR.name}/system.json`;
mkdirSync(DIR.name, { recursive: true });
writeFileSync(system, `${JSON.stringify(overlay, null, 2)}\n`);
writeFileSync(CONFIG.name, `${JSON.stringify({ ...config, system }, null, 2)}\n`);
console.log(`${pack.system} ${pack.version ?? ''} is this directory's system: ${system}, named in ${CONFIG.name}.`);
console.log(`  ${report.stated.length} colours and voices stated by the pack, ${report.derived.length} derived; standards system import ${bundled ? `${ROOT}packs/${which}.tokens.json` : which} lists each one.`);
console.log('Next: standards lint <page.html | url>');
