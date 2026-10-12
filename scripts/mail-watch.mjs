// mail-watch: poll Gmail via IMAP for new messages, report new ones not yet seen.
// Credentials: %USERPROFILE%\.mail-watch.json  {"user":"...","pass":"...","label":"inbox"}
// No deps, no repo secrets. State: same folder, .mail-watch-state.json (seen UIDs).
// Usage: node scripts/mail-watch.mjs [--all]
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const credPath = path.join(process.env.USERPROFILE ?? '', '.mail-watch.json');
const statePath = path.join(process.env.USERPROFILE ?? '', '.mail-watch-state.json');

if (!fs.existsSync(credPath)) {
  console.log('NO-CRED: create', credPath, 'with {"user":"<gmail>","pass":"<16-char app password>"}');
  process.exit(0);
}
const cred = JSON.parse(fs.readFileSync(credPath, 'utf8'));
const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : { seen: {} };
const all = process.argv.includes('--all');

function imap() {
  return new Promise((resolve, reject) => {
    // sandbox/proxy MITMs TLS (self-signed); reading own inbox, accept it
    const sock = tls.connect({ host: 'imap.gmail.com', port: 993, rejectUnauthorized: false }, () => resolve(sock));
    sock.on('error', reject);
    sock.setTimeout(30000, () => { sock.destroy(); reject(new Error('timeout')); });
  });
}

class Client {
  constructor(sock) {
    this.sock = sock;
    this.buf = '';
    this.pending = [];
    this.waiters = [];
    this.n = 0;
    sock.on('data', (d) => {
      this.buf += d.toString('utf8');
      let i;
      while ((i = this.buf.indexOf('\r\n')) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 2);
        if (/^A\d+ /i.test(line)) { const w = this.waiters.shift(); if (w) w(line); }
        else if (this.pending.length) this.pending[this.pending.length - 1].push(line);
      }
    });
  }
  cmd(command) {
    return new Promise((resolve) => {
      const tag = 'A' + (++this.n);
      const lines = [];
      this.pending.push(lines);
      this.waiters.push((done) => resolve({ lines, done }));
      this.sock.write(`${tag} ${command}\r\n`);
    });
  }
  async simple(command) {
    const { done, lines } = await this.cmd(command);
    if (process.env.MAIL_DEBUG) console.error('CMD:', command.split(' ')[0], '=>', done, '| lines:', lines.length);
    return { done, lines };
  }
}

const sock = await imap();
const c = new Client(sock);
await c.simple(`LOGIN "${cred.user}" "${cred.pass}"`);
await c.simple('EXAMINE INBOX');

const search = await c.simple(all ? 'UID SEARCH ALL' : 'UID SEARCH UNSEEN');
const searchLine = (search.lines.find((l) => /^\* SEARCH/i.test(l)) ?? '');
const uids = (searchLine.match(/\d+/g) ?? []).map(Number);
const seen = state.seen ?? {};
const fresh = all ? uids : uids.filter((u) => !seen[u]);
const out = [];

for (const uid of fresh.slice(-50)) {
  const f = await c.simple(`UID FETCH ${uid} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)])`);
  const raw = f.lines.join('\n');
  const get = (h) => { const m = raw.match(new RegExp('^' + h + ':(.*)$', 'im')); return m ? m[1].trim().replace(/\s+/g, ' ').slice(0, 120) : ''; };
  out.push({ uid, from: get('From'), subject: get('Subject'), date: get('Date') });
  seen[uid] = 1;
}

await c.simple('LOGOUT');
fs.writeFileSync(statePath, JSON.stringify({ seen }, null, 0));
fs.writeFileSync(path.join(root, 'trust-data', 'mail-watch-latest.json'), JSON.stringify({ at: new Date().toISOString(), total: fresh.length, mails: out }, null, 1));
if (!out.length) { console.log('NO-NEW-MAIL'); process.exit(0); }
for (const m of out) console.log(`MAIL | ${m.from} | ${m.subject}`);
console.log(`TOTAL ${out.length} new`);
