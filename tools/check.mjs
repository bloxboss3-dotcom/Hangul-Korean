/* Smoke test for a single-file app: pull the <script> out of index.html and
   make sure it actually parses, then assert the handful of invariants that,
   if broken, would leave the page blank. Cheap, no dependencies, and it runs
   in CI before anything is ever deployed. */

import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('..', import.meta.url).pathname;
const html = readFileSync(root + 'index.html', 'utf8');
const fail = [];
const ok = m => console.log('  ok   ' + m);
const bad = m => { fail.push(m); console.log('  FAIL ' + m); };

/* ---- 1. the script block parses ---- */
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!scripts.length) bad('no inline <script> found in index.html');
scripts.forEach((src, i) => {
  try {
    new vm.Script(src, { filename: `index.html:script[${i}]` });
    ok(`script block ${i} parses (${src.split('\n').length} lines)`);
  } catch (e) {
    bad(`script block ${i} is not valid JavaScript — ${e.message}`);
  }
});

/* ---- 2. the data tables are well formed ---- */
const body = scripts.join('\n');
const sandbox = {
  window: { AudioContext: null, addEventListener() {}, matchMedia: () => ({ matches: false }) },
  document: { documentElement: { classList: { toggle() {}, add() {}, remove() {} } } },
  console
};
for (const name of ['HANGUL_UNITS', 'UNITS_A', 'UNITS_B', 'CONVERSATIONS']) {
  const m = body.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\];)`));
  if (!m) { bad(`${name} not found`); continue; }
  try {
    const val = vm.runInNewContext('(' + m[1].replace(/;$/, '') + ')', { ...sandbox });
    if (!Array.isArray(val) || !val.length) bad(`${name} is empty`);
    else ok(`${name} — ${val.length} entries`);
    sandbox[name] = val;
  } catch (e) {
    bad(`${name} does not evaluate — ${e.message}`);
  }
}

/* ---- 3. conversations reference real units and are internally consistent ---- */
if (sandbox.CONVERSATIONS && sandbox.UNITS_A && sandbox.UNITS_B) {
  const unitIds = new Set([...sandbox.UNITS_A, ...sandbox.UNITS_B].map(u => u.id));
  let lines = 0, chunkProblems = 0, missingUnits = 0;
  for (const c of sandbox.CONVERSATIONS) {
    if (!unitIds.has(c.unit)) { missingUnits++; console.log(`       ${c.id} points at unknown unit ${c.unit}`); }
    for (const l of c.lines) {
      lines++;
      if (!l.ko || !l.en || !l.rom || !l.lit) {
        chunkProblems++;
        console.log(`       ${c.id} has a line missing ko/rom/en/lit`);
        continue;
      }
      // Joined in order, the chunks must reassemble the line they belong to.
      // A chunk that does not line up renders as nothing at all, so this is
      // the one invariant the colour mapping cannot survive without.
      const flat = s => s.replace(/[\s.,!?~…'"‘’“”-]/g, '');
      const joined = (l.c || []).map(ch => ch[0]).join('');
      if (flat(joined) !== flat(l.ko)) {
        chunkProblems++;
        console.log(`       ${c.id}: chunks do not reassemble the line`);
        console.log(`         line   "${l.ko}"`);
        console.log(`         chunks "${joined}"`);
      }
    }
  }
  if (missingUnits) bad(`${missingUnits} conversation(s) point at a unit that does not exist`);
  if (chunkProblems) bad(`${chunkProblems} conversation line(s) are malformed`);
  else ok(`conversations — ${lines} lines, chunk mapping reassembles every line`);
}

/* ---- 3a. branch points sit on your lines, and nobody repeats themselves ----
   A branch inserts the chosen option's reply and then resumes the script, so
   a reply that says what the next scripted line is about to say makes the
   other speaker say it twice. That reads as a bug and is easy to reintroduce
   while editing dialogue, so it is checked rather than remembered. */
{
  const m = body.match(/const BRANCHES = (\{[\s\S]*?\n\});/);
  if (!m) bad('BRANCHES not found');
  else if (sandbox.CONVERSATIONS) {
    let branches = null;
    try { branches = vm.runInNewContext('(' + m[1] + ')', { ...sandbox }); }
    catch (e) { bad(`BRANCHES does not evaluate — ${e.message}`); }
    if (branches) {
      const byId = Object.fromEntries(sandbox.CONVERSATIONS.map(c => [c.id, c]));
      let points = 0, options = 0, problems = 0;
      for (const [id, list] of Object.entries(branches)) {
        const c = byId[id];
        if (!c) { bad(`BRANCHES.${id} has no conversation`); problems++; continue; }
        for (const b of list) {
          points++;
          const line = c.lines[b.at];
          if (!line) { bad(`${id}@${b.at} is past the end`); problems++; continue; }
          if (line.w !== c.you) { bad(`${id}@${b.at} is not your line`); problems++; }
          if (!b.why) { bad(`${id}@${b.at} has no prompt`); problems++; }
          if (!Array.isArray(b.options) || b.options.length < 2) { bad(`${id}@${b.at} needs at least two options`); problems++; continue; }
          const seen = new Set();
          const next = c.lines[b.at + 1];
          for (const [i, o] of b.options.entries()) {
            options++;
            if (!o.ko || !o.rom || !o.en) { bad(`${id}@${b.at}[${i}] is missing a field`); problems++; }
            if (!o.reply || !o.reply.ko || !o.reply.rom || !o.reply.en) { bad(`${id}@${b.at}[${i}] is missing its reply`); problems++; }
            if (seen.has(o.ko)) { bad(`${id}@${b.at}[${i}] repeats another option`); problems++; }
            seen.add(o.ko);
            // the reply must not pre-empt the scripted line that follows it
            if (next && o.reply) {
              const r = o.reply.ko.replace(/[^가-힣]/g, ''), n = next.ko.replace(/[^가-힣]/g, '');
              let shared = '';
              for (let a = 0; a < r.length; a++) {
                for (let len = 4; a + len <= r.length; len++) {
                  const s = r.slice(a, a + len);
                  if (n.includes(s) && s.length > shared.length) shared = s;
                }
              }
              if (shared) { bad(`${id}@${b.at}[${i}] reply repeats "${shared}" from the next line`); problems++; }
            }
          }
        }
      }
      if (!problems) ok(`branches — ${points} points, ${options} options, none pre-empting the script`);
    }
  }
}

/* ---- 3b. recorded audio, if any, matches the conversations ---- */
if (existsSync(root + 'audio/manifest.json') && sandbox.CONVERSATIONS) {
  const man = JSON.parse(readFileSync(root + 'audio/manifest.json', 'utf8'));
  const valid = new Set();
  for (const c of sandbox.CONVERSATIONS) {
    c.lines.forEach((_, i) => valid.add(`${c.id}-${String(i).padStart(2, '0')}`));
  }
  // A clip naming a line that does not exist means the dialogue was edited
  // after recording, and that clip would now play against the wrong text.
  const orphans = man.lines.filter(id => !valid.has(id));
  const missingFiles = man.lines.filter(id => !existsSync(`${root}audio/lines/${id}.mp3`));
  if (orphans.length) bad(`manifest lists ${orphans.length} clip(s) with no matching line: ${orphans.slice(0, 5).join(', ')}`);
  else if (missingFiles.length) bad(`manifest lists ${missingFiles.length} clip(s) whose file is missing: ${missingFiles.slice(0, 5).join(', ')}`);
  else ok(`recorded audio — ${man.lines.length}/${valid.size} lines, every clip maps to a real line`);

  for (const id of man.complete || []) {
    const c = sandbox.CONVERSATIONS.find(x => x.id === id);
    const all = c && c.lines.every((_, i) => man.lines.includes(`${id}-${String(i).padStart(2, '0')}`));
    if (!all) bad(`${id} is marked complete but is missing clips`);
  }
}

/* ---- 4. the PWA plumbing is present ---- */
for (const f of ['manifest.webmanifest', 'sw.js', 'offline.html', 'icons/icon-192.png', 'icons/icon-512.png']) {
  if (existsSync(root + f)) ok(f + ' present');
  else bad(f + ' is missing');
}
if (/rel="manifest"/.test(html)) ok('index.html links the manifest');
else bad('index.html does not link the manifest');
if (/serviceWorker/.test(html)) ok('index.html registers a service worker');
else bad('index.html never registers the service worker');

console.log('');
if (fail.length) { console.error(`${fail.length} problem(s) found.`); process.exit(1); }
console.log('All checks passed.');
