#!/usr/bin/env node
// Thin launcher: resolves @eidonze/mcpreflight and forwards argv/exit code.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

function resolveTarget(relBin) {
  const pkgPath = require.resolve('@eidonze/mcpreflight/package.json');
  return path.join(path.dirname(pkgPath), relBin);
}

let target;
try {
  target = resolveTarget('bin/mcpreflight.mjs');
} catch (err) {
  console.error('mcpreflight: cannot locate @eidonze/mcpreflight. Reinstall with: npm i -g mcpreflight');
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
  console.error('mcpreflight: failed to start @eidonze/mcpreflight');
  console.error(String(err && err.message ? err.message : err));
  process.exit(3);
});
