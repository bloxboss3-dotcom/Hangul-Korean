/* Build audio/manifest.json from whatever clips exist on disk.

   The app asks for this once at boot and falls back to speech synthesis for
   any line it does not list, so a half-finished set of recordings degrades
   line by line rather than all at once. Re-run after adding clips. */

import { readdirSync, existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const dir = root + 'audio/lines';
if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); }

const html = readFileSync(root + 'index.html', 'utf8');
const CONVERSATIONS = eval('(' + html.match(/const CONVERSATIONS = (\[[\s\S]*?\n\];)/)[1].replace(/;$/, '') + ')');

const files = readdirSync(dir).filter(f => /^C\d+-\d\d\.mp3$/.test(f)).sort();
const have = new Set(files.map(f => f.replace(/\.mp3$/, '')));

let bytes = 0;
files.forEach(f => { bytes += statSync(dir + '/' + f).size; });

// Report coverage per conversation so it is obvious what is still missing.
const rows = [];
let total = 0, covered = 0;
for (const c of CONVERSATIONS) {
  const ids = c.lines.map((_, i) => `${c.id}-${String(i).padStart(2, '0')}`);
  const n = ids.filter(id => have.has(id)).length;
  total += ids.length; covered += n;
  rows.push({ id: c.id, have: n, of: ids.length });
}

const manifest = {
  format: 'mp3',
  base: './audio/lines/',
  lines: [...have].sort(),
  // Which speakers are fully covered, so the UI can say "this conversation
  // has real audio" rather than discovering it line by line.
  complete: CONVERSATIONS
    .filter(c => c.lines.every((_, i) => have.has(`${c.id}-${String(i).padStart(2, '0')}`)))
    .map(c => c.id)
};

writeFileSync(root + 'audio/manifest.json', JSON.stringify(manifest));

console.log(`${covered}/${total} lines recorded · ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`fully covered conversations: ${manifest.complete.join(', ') || 'none yet'}`);
console.log('');
rows.forEach(r => {
  const bar = '█'.repeat(Math.round(r.have / r.of * 12)).padEnd(12, '·');
  console.log(`  ${r.id.padEnd(4)} ${bar} ${r.have}/${r.of}`);
});
