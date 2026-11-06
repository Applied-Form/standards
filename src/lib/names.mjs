/**
 * The names of the product. Decision 0029 records the approval; every other file takes a name from
 * here, so a name is spelled once. The old names (`af`, `af-mcp`, the `af_*` tools, `AF_BRAND`,
 * `AF_CHROMIUM`, `af.config.json`, `af-baseline.json`, `.af/`) were removed in 5.0.0 and are not read
 * or accepted any more; docs/migrating-to-5.md maps each to its replacement.
 *
 * This file imports nothing, so the open export can list it without pulling anything else in.
 */

export const PRODUCT = 'Standards';
export const FULL_NAME = 'Standards by Applied Form';
export const COMMAND = 'standards';
export const PACKAGE = '@appliedform/standards';
export const SERVER_NAME = 'io.github.Applied-Form/standards';
/** The client config key and the MCP serverInfo name. Decision 0029 (Q6): it stays `standards`; the foundation's server is `standards-schema`. */
export const CLIENT_KEY = 'standards';

/** Files and directories. */
export const CONFIG = { name: 'standards.config.json' };
export const BASELINE = { name: 'standards-baseline.json' };
export const DIR = { name: '.standards' };

/**
 * The `<meta name="generator">` value of a report, and the two values older reports carry. A report
 * page is recognised by any of the three, permanently: a report written by an older release is
 * still a report. They are the only old command names the code still recognises.
 */
export const GENERATOR = 'standards audit';
export const LEGACY_GENERATORS = ['af audit', 'af report'];
