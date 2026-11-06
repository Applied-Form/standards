# Migrating to Standards 5

@eyebrow Document type · Migration guide · Register II

Standards 5.0.0 removes the names the product had before it was called Standards. They worked in 4.x and
printed one line on stderr saying they were deprecated. In 5.0.0 they are not read. A command that finds one
in use stops, with exit status 2 and one line that names the replacement, so that nothing is checked against
the wrong system by mistake. This page lists each name, what replaces it, and how to move. Decision 0029
records the rename.

## What replaces what

| Removed in 5.0.0 | Use instead |
|---|---|
| command `af` | `standards` |
| command `af-mcp` | `standards mcp` |
| `af mcp`, which listed the `af_*` tools | `standards mcp`, which lists the `standards_*` tools |
| tools `af_lint`, `af_fix`, `af_rules`, `af_tokens`, `af_contrast`, `af_brand`, `af_move`, `af_system`, `af_drift` | `standards_lint`, `standards_fix`, `standards_rules`, `standards_tokens`, `standards_contrast`, `standards_brand`, `standards_move`, `standards_system`, `standards_drift` |
| the second content item of an `af_*` call, which held the deprecation line | nothing: a call returns one content item |
| the argument `--legacy-tool-names` | nothing: `standards mcp` ignores it |
| environment variable `AF_BRAND` | `STANDARDS_SYSTEM` |
| environment variable `AF_CHROMIUM` | `STANDARDS_CHROMIUM` |
| file `af.config.json` | `standards.config.json` |
| file `af-baseline.json` | `standards-baseline.json` |
| directory `.af/` | `.standards/` |
| package `@appliedform/engine` | `@appliedform/standards` |

## What stopped working

- **`af` and `af-mcp` are not installed.** A script, a CI step or a client config that runs either one fails
  with "command not found". `npx af` does not fetch Standards: `af` on npm is an unrelated package.
- **An `af_*` tool call is an unknown tool.** The server answers it with error -32602. A client is only
  shown the tools the server lists, so an agent instruction, a prompt or an allowlist that names `af_lint`
  has to be changed to `standards_lint`, and so on for the other eight.
- **`AF_BRAND` and `AF_CHROMIUM` are not read, and setting one is an error.** `standards` and the MCP
  server stop with exit status 2 and one line, for example
  `standards: AF_BRAND is no longer read: use STANDARDS_SYSTEM`, before they do anything else.
- **`af.config.json`, `af-baseline.json` and `.af/` are not read, and having one without its new name
  is an error.** `standards` and the MCP server, run in a directory that has `af.config.json` and no
  `standards.config.json`, stop with exit status 2 and one line, for example
  `standards: af.config.json is no longer read: rename it to standards.config.json`. The same holds for
  `af-baseline.json` and `.af/`. Once the new name exists the old file is only left over: it is not read,
  renamed or deleted, and nothing is said about it.
- **`standards init` does not carry an old config forward.** Rename the file first. Run on its own, the
  init script writes `standards.config.json` with the system it names, and leaves an old config unread and
  unchanged.
- **A path to `.af/` in a config is a plain path.** It still works if the file is there. Nothing creates
  `.af/` any more: `standards init` writes `.standards/`.

The refusal is a deliberate guard and not a compatibility layer: it names the replacement and does
nothing else, and it is one small module, `src/lib/removed-names.mjs`. It runs in the `standards`
command and when the MCP server starts. A program that imports the library is not checked, and neither
are the repository's own `npm run` scripts, which read `STANDARDS_SYSTEM` only.

## How to move

1. Uninstall the old package first: `npm uninstall @appliedform/engine` (or `npm uninstall -g
   @appliedform/engine`). Both packages ship an `af` bin, and a global install of one over the other fails
   with EEXIST. Then `npm install @appliedform/standards`.
2. Rename the files: `git mv af.config.json standards.config.json` and `git mv af-baseline.json
   standards-baseline.json`. If the config names a path under `.af/`, move the directory
   (`git mv .af .standards`) and update that path.
3. Rename the variables wherever they are set: `AF_BRAND` to `STANDARDS_SYSTEM` and `AF_CHROMIUM` to
   `STANDARDS_CHROMIUM`. Look in shell profiles, CI files and `package.json` scripts.
4. Replace the commands: `af <command>` becomes `standards <command>`, and `af-mcp` becomes `standards mcp`.
   `npx -y @appliedform/standards@5 mcp` runs the server without installing it and stays on the 5.x line.
5. In an MCP client, change the server's launch command to `npx standards mcp` (or `npx -y
   @appliedform/standards@5 mcp` without an install) and every place that names an `af_*` tool.
6. Run `standards rules` once in the project. It stops with a line if a removed name is still in use.

## Palimpsest is removed

Palimpsest, the experimental move that overprinted display type in three layers, is gone from the token
file: `spreads.palimpsest`, `recipes.palimpsest`, the opacity token `opacity.layer-ink` and the motion
value `register`. Removing a token is a major change, so the house system is 5.0.0. What to check:

- A page that sets `data-spread="palimpsest"` no longer has a recipe to match. The linter reads it as a
  spread with no recipe, and `recipe-mismatch` does not apply. The page's own CSS is yours.
- `standards move palimpsest` and the `standards_move` tool answer that there is no such move.
- A stylesheet that reads `var(--af-opacity-layer-ink)` has no value for it: `dist/tokens.css` no longer
  defines it. Use a value from the opacity tokens that remain, or set your own.
- The numbers of the later moves shift by one: in the house reference pages Marginalia, Counter and Hinge
  are 09, 10 and 11, and Tessera and Caesura are 12 and 13.

## Long documents are measured

A Register II document now prints its body text at 11pt, and the gate measures how a long one is paced.
A document of more than 100 printed pages with no `data-part="opener"` markup fails the new `pacing`
rule, so existing long documents will be flagged until you mark each section opener, and the element where
statements, notes and annexes begin with `data-part="back-matter"`. The rules are at the standard level, so
a team may lower them. Short documents are unaffected.

## What does not change

The `af-` prefix of CSS classes and custom properties, `$extensions["form.applied"]` in the token file, the
schema ids `af-audit/1` and `af-builders/1`, the skill id `applied-form-gate`, the `af/` prefix of the
Style Dictionary transform names, and the report generator values `af audit` and `af report`: a report
written by an older release is still recognised as a report. The default report file is
`standards-audit.html`, as in 4.x.
