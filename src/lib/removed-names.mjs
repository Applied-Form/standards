/**
 * The guard for the names Standards 5.0.0 removed (decision 0029): `AF_BRAND`, `AF_CHROMIUM`,
 * `af.config.json`, `af-baseline.json` and `.af/`. They are not read. A command that carried on without
 * them would judge against the house system, or with no config, and report a pass for a measurement
 * nobody asked for, so an entry point that finds one in use stops with exit 2 and one line that names
 * the replacement. This is not a shim: nothing of the old name is honoured, and the old file is never
 * read, renamed or deleted. An old file beside the new one is only left over, and is not reported.
 *
 * It is called by the `standards` command and by the MCP server's start (scripts/mcp.mjs), and nowhere
 * else: a program that imports the library is not asked to check its environment.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG, BASELINE, DIR } from './names.mjs';

const VARIABLES = [['AF_BRAND', 'STANDARDS_SYSTEM'], ['AF_CHROMIUM', 'STANDARDS_CHROMIUM']];
const FILES = [['af.config.json', CONFIG.name], ['af-baseline.json', BASELINE.name], ['.af/', `${DIR.name}/`]];

/** One line for each removed name in use: a variable that is set, or an old file with no new one beside it. */
export function removedNames(env = process.env, cwd = process.cwd()) {
  const lines = [];
  for (const [old, current] of VARIABLES) if (env[old] !== undefined) lines.push(`${old} is no longer read: use ${current}`);
  for (const [old, current] of FILES) {
    if (existsSync(join(cwd, old)) && !existsSync(join(cwd, current))) lines.push(`${old} is no longer read: rename it to ${current}`);
  }
  return lines;
}

/** For an entry point: write each line as `standards: <line>` to stderr and exit 2. Returns when nothing is in use. */
export function refuseRemovedNames(env = process.env, cwd = process.cwd()) {
  const lines = removedNames(env, cwd);
  if (!lines.length) return;
  for (const line of lines) console.error(`standards: ${line}`);
  process.exit(2);
}
