// Pre-flight duplicate guard for every outreach script.
// Every script that files an issue, sends an email or offers a badge MUST run this first
// and refuse the target when it is already in trust-data/contacts.json.
//
//   node scripts/outreach-guard.mjs owner/repo [owner/repo ...]
//
// Exit 0 means every target is untouched. Exit 1 means at least one is already ours,
// or is marked do-not-contact. Two or more of our own issues in one repo is the exact
// mistake this guard exists to make impossible, so it is a hard block, not a warning.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const contactsPath = path.resolve(__dirname, '..', 'trust-data', 'contacts.json');

export function loadContacts() {
  return JSON.parse(fs.readFileSync(contactsPath, 'utf8')).contacts;
}

export function checkTarget(repo) {
  const c = loadContacts()[repo];
  if (!c) return { repo, ok: true, reason: 'never touched' };
  if (c.doNotContact) return { repo, ok: false, reason: `do-not-contact (${c.status})` };
  if (c.issueCount > 0) return { repo, ok: false, reason: `already has ${c.issueCount} of our issues: ${c.issues.map((i) => '#' + i.number).join(',')}` };
  return { repo, ok: false, reason: `already recorded as ${c.status}` };
}

if (process.argv[1] && url.fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const targets = process.argv.slice(2);
  if (!targets.length) {
    console.error('usage: node scripts/outreach-guard.mjs owner/repo [owner/repo ...]');
    process.exit(3);
  }
  let blocked = 0;
  for (const repo of targets) {
    const r = checkTarget(repo);
    if (!r.ok) blocked++;
    console.log(`${r.ok ? 'ALLOW ' : 'BLOCK '} ${repo}  ${r.reason}`);
  }
  console.log(blocked ? `${blocked} of ${targets.length} targets are blocked` : `all ${targets.length} targets are clear`);
  process.exit(blocked ? 1 : 0);
}
