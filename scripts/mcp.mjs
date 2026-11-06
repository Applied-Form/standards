#!/usr/bin/env node
/**
 * `standards mcp` — serve the gate to any MCP client over stdio.
 *
 *   standards mcp                          serve
 *   standards mcp --selftest               exercise the protocol without a client, and exit non-zero if it breaks
 */
import { serve, handle, TOOLS, SERVER } from '../src/lib/mcp.mjs';
import { refuseRemovedNames } from '../src/lib/removed-names.mjs';

refuseRemovedNames(); // a removed name in use is exit 2 before the server answers anything (decision 0029)

if (process.argv.includes('--selftest')) {
  const calls = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'standards_rules', arguments: { group: 'absence' } } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'standards_contrast', arguments: { foreground: '#1A1A1A', background: '#FFFFFF' } } },
    { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'standards_move', arguments: {} } },
    { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'standards_nope', arguments: {} } },
  ];
  let bad = 0;
  for (const call of calls) {
    const r = await handle(call);
    const label = call.params?.name ?? call.method;
    if (call.id === 6) {
      if (!r.error) { bad++; console.log(`✗ ${label}: an unknown tool should be an error`); }
      else console.log(`✓ ${label} refused: ${r.error.message}`);
      continue;
    }
    if (!r || r.error) { bad++; console.log(`✗ ${label}: ${r?.error?.message ?? 'no response'}`); continue; }
    const size = JSON.stringify(r.result).length;
    console.log(`✓ ${label} (${size} bytes)`);
  }
  console.log(bad ? `${bad} problem(s)` : `${SERVER.name} ${SERVER.version}: ${TOOLS.length} tools, protocol clean`);
  process.exit(bad ? 1 : 0);
}

await serve(process.stdin, process.stdout);
