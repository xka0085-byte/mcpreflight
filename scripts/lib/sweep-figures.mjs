// Shared access to the numbers we are allowed to publish.
//
// Background: every headline figure used to be a literal (9,991 / 34,190 / "registry-wide")
// typed into templates. Some of them came from a scanner whose paginator stopped after 300
// pages, so they described a subset of the registry, not the registry. The rule now is that a
// figure must come from a file produced by a complete sweep, and copy must say which
// population it describes.
//
// If no complete sweep exists yet, callers get null and are expected to fall back to wording
// without a number (never to invent or reuse a stale one).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..', '..');

const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Figures from the last complete registry walk (scripts/registry-census.mjs).
 * endpoints = registry records declaring an http(s) remote, i.e. what the scanner probes.
 */
export function sweepFigures(root = repoRoot) {
  const census = readJson(path.join(root, 'trust-data', 'registry-census.json'));
  const stats = readJson(path.join(root, 'trust-data', 'scan-stats.json'));
  const out = {
    endpoints: null,            // formatted, e.g. "34,190"
    endpointsRaw: null,
    registryEntries: null,      // every registry record, all versions
    sweptAt: null,
    complete: false,
    scanDate: stats?.date ?? null,
    scannedTotal: stats?.total ?? null,
  };
  if (census?.complete === true) {
    out.complete = true;
    out.endpointsRaw = census.withRemote;
    out.endpoints = fmt(census.withRemote);
    out.registryEntries = fmt(census.entriesTotal);
    out.sweptAt = String(census.finishedAt ?? '').slice(0, 10) || null;
  }
  return out;
}

/** "34,190 endpoints" when the sweep is complete, otherwise wording with no number. */
export function endpointPhrase(root = repoRoot) {
  const f = sweepFigures(root);
  return f.complete && f.endpoints ? `${f.endpoints} endpoints` : 'the endpoints our latest full sweep returned';
}
