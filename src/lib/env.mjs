/**
 * The environment variables a person can set (decision 0029): `STANDARDS_SYSTEM`, which names the
 * system a command judges against, and `STANDARDS_CHROMIUM`, which names a Chromium executable.
 * `AF_BRAND` and `AF_CHROMIUM`, the names they replaced, are not read (removed in 5.0.0).
 *
 * Every read looks at the environment as it is at that moment and nothing is copied when this file is
 * imported. The tokens are read once per process, and a caller may set the variable after it has
 * imported this file and before it imports them (src/lib/system-arg.mjs, eval/builders-report.mjs); a
 * copy taken at import would miss that write and judge against the house system.
 *
 * Reading never writes to the environment. A value that is defined but empty is a value.
 */
const SYSTEM = 'STANDARDS_SYSTEM';
const CHROMIUM = 'STANDARDS_CHROMIUM';

/** The system to judge against, or undefined when it is not set. */
export const systemFromEnv = (env = process.env) => env[SYSTEM];

/** The Chromium executable, or undefined when it is not set. */
export const chromiumFromEnv = (env = process.env) => env[CHROMIUM];

/** Choose the system for this process. */
export function setSystem(value) {
  process.env[SYSTEM] = value;
}

/**
 * The environment for a child process: this one's, with `extra` applied last; a key given as
 * undefined is removed.
 */
export function childEnv(extra = {}) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) delete env[key]; else env[key] = value;
  }
  return env;
}
