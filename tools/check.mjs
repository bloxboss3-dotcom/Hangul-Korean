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
for (const name of ['KO_SOUNDS', 'KO_UNITS_A', 'KO_UNITS_B', 'KO_CONVERSATIONS', 'ES_SOUNDS', 'ES_UNITS_A', 'ES_UNITS_B', 'ES_CONVERSATIONS']) {
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

/* ---- 3. conversations reference real units and are internally consistent ----
   Runs once per course now that the app carries two. */
for (const CO of ['KO', 'ES']) {
  sandbox.HANGUL_UNITS = sandbox[CO + '_SOUNDS'];
  sandbox.UNITS_A = sandbox[CO + '_UNITS_A'];
  sandbox.UNITS_B = sandbox[CO + '_UNITS_B'];
  sandbox.CONVERSATIONS = sandbox[CO + '_CONVERSATIONS'];
  courseCheck(CO);
}
// The remaining checks (branches, recorded audio) are Korean-only.
sandbox.CONVERSATIONS = sandbox.KO_CONVERSATIONS;
sandbox.HANGUL_UNITS = sandbox.KO_SOUNDS;

function courseCheck(CO) {
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
  else ok(`${CO} conversations — ${lines} lines, chunk mapping reassembles every line`);
}

/* ---- 3z. no two letters answer the same question ----
   ㅐ and ㅔ are the same sound, and so are ㅙ ㅚ ㅞ. Any exercise that asks
   "which letter is <sound>" over a set containing both has two right answers
   and marks one wrong. The app handles the known groups by asking about
   spelling instead; this catches a NEW collision arriving in the data, where
   two letters would share a sound with nothing declaring them twins. */
if (sandbox.HANGUL_UNITS) {
  const declared = new Set();
  const dm = body.match(new RegExp(`const ${CO}_SAME_SOUND = (\\[[\\s\\S]*?\\n?\\]);`));
  const groups = dm ? vm.runInNewContext('(' + dm[1].replace(/;$/, '') + ')', {}) : [];
  for (const g of groups)
    for (const a of g) for (const b of g) if (a !== b) declared.add(a + '|' + b);

  const letters = sandbox.HANGUL_UNITS.flatMap(u => u.letters || []);
  // Grouped by type: ㄴ and ㄴ(받침) are the same phoneme in different
  // positions, which the romanisation already separates ("n" vs "-n"), and
  // the exercise pools prefer same-type distractors. Two VOWELS sharing a
  // sound is the case with no way out.
  const bySound = new Map(), byRom = new Map();
  for (const l of letters) {
    const k = l.type + '\u0000' + l.sound;
    if (!bySound.has(k)) bySound.set(k, []);
    bySound.get(k).push(l.ch);
    if (!byRom.has(l.rom)) byRom.set(l.rom, []);
    byRom.get(l.rom).push(l.ch);
  }
  let undeclared = 0, romClash = 0;
  for (const [k, chs] of bySound) {
    if (chs.length < 2) continue;
    const sound = k.split('\u0000')[1];
    for (const a of chs) for (const b of chs) {
      if (a !== b && !declared.has(a + '|' + b)) {
        bad(`${a} and ${b} are both ${k.split('\u0000')[0]}s sounding "${sound}" but are not declared in SAME_SOUND`);
        undeclared++;
      }
    }
  }
  // The escape hatch for twins is romanisation, so that at least must differ.
  for (const [rom, chs] of byRom) if (chs.length > 1) { bad(`${chs.join(' and ')} share the romanisation "${rom}" — nothing can tell them apart`); romClash++; }
  if (!undeclared && !romClash)
    ok(`${CO} letters — ${letters.length} letters, every same-sound pair declared and separable by spelling`);
}
}

/* ---- 3y. no course speaks or celebrates in another course's language ----
   Every string in COURSE_LINES is either shown next to the mascot or handed
   straight to speechSynthesis, so a Korean line surviving in the Spanish or
   chess table means an es-ES voice reading Hangul — which comes out as
   silence. It happened once (the whole table used to be Korean-only), so it
   is checked rather than remembered. */
{
  const m = body.match(/const COURSE_LINES = (\{[\s\S]*?\n\});/);
  if (!m) bad('COURSE_LINES not found');
  else {
    let lines = null;
    try { lines = vm.runInNewContext('(' + m[1] + ')', {}); }
    catch (e) { bad(`COURSE_LINES does not evaluate — ${e.message}`); }
    if (lines) {
      const hangul = /[ᄀ-ᇿ㄰-㆏가-힯]/;
      const flat = o => typeof o === 'string' ? [o]
        : Array.isArray(o) ? o.flatMap(flat)
          : o && typeof o === 'object' ? Object.values(o).flatMap(flat) : [];
      let strays = 0, counted = 0;
      for (const [id, tbl] of Object.entries(lines)) {
        // Every course needs the full set — a missing key is a blank bubble.
        for (const k of ['spoken', 'mascot', 'done', 'head', 'blitz']) {
          if (!tbl[k]) { bad(`COURSE_LINES.${id} is missing "${k}"`); strays++; }
        }
        if (tbl.mascot) for (const mood of ['happy', 'wow', 'oops', 'think']) {
          if (!(tbl.mascot[mood] || []).length) { bad(`COURSE_LINES.${id}.mascot.${mood} is empty`); strays++; }
        }
        if (!(tbl.spoken || []).length) { bad(`COURSE_LINES.${id}.spoken is empty — praise would be silent`); strays++; }
        if (id === 'ko') continue;
        for (const s of flat(tbl)) {
          counted++;
          if (hangul.test(s)) { bad(`COURSE_LINES.${id} still says "${s}" — a ${id} voice cannot read that`); strays++; }
        }
      }
      if (!strays) ok(`course lines — ${Object.keys(lines).length} courses, ${counted} non-Korean strings, none carrying Hangul`);
    }
  }
}

/* ---- 3x. a course claiming portraits has one for every character ----
   `portraits: true` swaps the drawn rig for <img src="icons/chars/<id>.webp">
   with no fallback, so one missing file is a broken image in the collection
   grid and a blank egg reveal — and eggs are random, so it would not show up
   reliably in a manual pass. */
{
  const casts = [...body.matchAll(/const (KO|ES|CH)_CHARACTERS = (\[[\s\S]*?\n\]);/g)];
  const owner = { KO: 'ko', ES: 'es', CH: 'chess' };
  // Which courses actually ask for portraits, read from the registry itself.
  // Split the registry into one chunk per course rather than regexing across
  // the whole file, where "the nearest id: above" is not a safe assumption.
  const wants = new Set();
  const reg = body.match(/const COURSES = \{([\s\S]*?)\n\};/);
  if (!reg) bad('COURSES registry not found');
  else {
    const chunks = reg[1].split(/\n  (?=\w+: \{)/);
    for (const chunk of chunks) {
      const id = (chunk.match(/id: '(\w+)'/) || [])[1];
      if (id && /portraits: true/.test(chunk)) wants.add(id);
    }
    if (!wants.size) bad('no course declares portraits — the collection would show rigs everywhere');
  }
  if (!casts.length) bad('no character casts found');
  let missing = 0, seen = 0;
  for (const [, tag, src] of casts) {
    const course = owner[tag];
    if (!wants.has(course)) continue;
    let cast = null;
    try { cast = vm.runInNewContext('(' + src + ')', {}); }
    catch (e) { bad(`${tag}_CHARACTERS does not evaluate — ${e.message}`); continue; }
    for (const c of cast) {
      seen++;
      if (!existsSync(`${root}icons/chars/${c.id}.webp`)) {
        bad(`${course} declares portraits but icons/chars/${c.id}.webp is missing`);
        missing++;
      }
    }
  }
  if (!missing && seen) ok(`portraits — ${seen} characters across ${wants.size} course(s), every one has an image`);
}

/* ---- 3a. branch points sit on your lines, and nobody repeats themselves ----
   A branch inserts the chosen option's reply and then resumes the script, so
   a reply that says what the next scripted line is about to say makes the
   other speaker say it twice. That reads as a bug and is easy to reintroduce
   while editing dialogue, so it is checked rather than remembered. */
{
  const m = body.match(/const KO_BRANCHES = (\{[\s\S]*?\n\});/);
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

/* ---- 3c. the build tiles can say what they sound like ----
   A build card prints the romanisation under each tile by lining the
   hand-written romanisation of a sentence up with its words, so every
   grammar example has to romanise word for word. The jamo romaniser is only
   the fallback for a tile the lookup misses, and it is checked here too. */
{
  let examples = 0, misaligned = 0;
  for (const name of ['KO_UNITS_A', 'KO_UNITS_B']) {
    const m = body.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\n\\];)`));
    if (!m) continue;
    let units;
    try { units = vm.runInNewContext('(' + m[1].replace(/;$/, '') + ')', { ...sandbox }); } catch (e) { continue; }
    for (const u of units) for (const g of (u.grammar || [])) for (const e of (g.examples || [])) {
      examples++;
      const ko = e.ko.replace(/[.!?]$/, '').split(/\s+/), rom = String(e.rom || '').replace(/[.!?]$/, '').split(/\s+/);
      if (ko.length !== rom.length) { bad(`${g.id}: "${e.ko}" has ${ko.length} words but its romanisation has ${rom.length}`); misaligned++; }
    }
  }
  if (!misaligned) ok(`build tiles — ${examples} grammar examples romanise word for word`);

  const pieces = ['CHO', 'JUNG', 'JONG', 'CHO_ROM', 'JUNG_ROM', 'JONG_ROM', 'JONG_LIAISON']
    .map(n => body.match(new RegExp(`const ${n} = [^\\n]*\\n`)));
  const fn = body.match(/function romanizeHangul\([\s\S]*?\n\}\n/);
  if (pieces.some(x => !x) || !fn) bad('romanizeHangul or its tables not found');
  else {
    const ctx = {};
    vm.runInNewContext(pieces.map(x => x[0]).join('') + fn[0] + ';this.romanizeHangul = romanizeHangul;', ctx);
    const cases = { '한국': 'han-guk', '사람이에요': 'sa-ra-mi-e-yo', '몰라요': 'mol-la-yo', '학생이에요': 'hak-saeng-i-e-yo',
      '좋아요': 'jo-a-yo', '재미있어요': 'jae-mi-i-sseo-yo', '어느': 'eo-neu', '뭐예요?': 'mwo-ye-yo?' };
    const wrong = Object.entries(cases).filter(([k, v]) => ctx.romanizeHangul(k) !== v);
    if (wrong.length) wrong.forEach(([k, v]) => bad(`romanizeHangul("${k}") gave "${ctx.romanizeHangul(k)}", wanted "${v}"`));
    else ok(`romaniser — ${Object.keys(cases).length} words, liaison and ㄹㄹ handled`);
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
