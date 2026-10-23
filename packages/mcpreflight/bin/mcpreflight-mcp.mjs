#!/usr/bin/env node
// Thin launcher for the MCP server mode: forwards to @eidonze/mcpreflight's mcpreflight-mcp bin.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

let target;
try {
  const pkgPath = require.resolve('@eidonze/mcpreflight/package.json');
  target = path.join(path.dirname(pkgPath), 'bin/mcpreflight-mcp.mjs');
} catch (err) {
  console.error('mcpreflight-mcp: cannot locate @eidonze/mcpreflight. Reinstall with: npm i -g mcpreflight');
  console.error(String(err && err.message ? err.message : err));
  process.exit(3);
}

const child = spawn(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig));
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code === null ? 2 : code);
});

child.on('error', (err) => {
  console.error('mcpreflight-mcp: failed to start @eidonze/mcpreflight');
  console.error(String(err && err.message ? err.message : err));
  process.exit(3);
});
