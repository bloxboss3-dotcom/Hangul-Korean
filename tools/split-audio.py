#!/usr/bin/env python3
"""Cut a multi-line Runway/Seed Audio recording back into one clip per dialogue line.

The recording scripts batch a speaker's lines into a single generation, which
keeps the number of manual generations at 25 instead of 122. Getting the lines
back out is the price, and naive silence-splitting does not pay it: the model
takes a breath at every clause boundary, so a five-line clip arrives as ten
segments and the gaps at line boundaries are not reliably longer than the gaps
inside a line.

What IS reliable is that the model breathes in a predictable place — after
. ? ! and , — so the number of segments can be predicted from the text before
looking at the audio. Predict the chunk count per line, check the total against
what was detected, and the grouping follows deterministically with no threshold
guessing at all.

The check that this worked is the speaking rate: every chunk should come out at
roughly the same seconds-per-syllable. A grouping that has drifted shows up
immediately as one chunk reading far faster or slower than its neighbours.

Usage:
    python3 tools/split-audio.py <clip.mp3> <block-id>       # e.g. C1-A
    python3 tools/split-audio.py <clip.mp3> <block-id> --write
"""

import json, re, subprocess, sys, pathlib
import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'audio' / 'lines'

FRAME = 0.02          # envelope resolution, seconds
MIN_GAP = 0.20        # quiet run that ends a segment
THRESH = 0.05         # of envelope peak
PAD = 0.12            # keep a little air either side of a line
CLAUSE = re.compile(r'[.?!,]')
HANGUL = re.compile(r'[가-힣]')


def conversations():
    """Read the dialogue straight out of the app so the text cannot drift.

    The table is JavaScript, not JSON — apostrophes, trailing commas and
    comments all defeat a regex rewrite — so let node evaluate it and hand
    back JSON rather than reimplementing a parser badly."""
    js = ("const h=require('fs').readFileSync(process.argv[1],'utf8');"
          "const m=h.match(/const CONVERSATIONS = (\\[[\\s\\S]*?\\n\\];)/);"
          "process.stdout.write(JSON.stringify(eval('('+m[1].replace(/;$/,'')+')')));")
    out = subprocess.run(['node', '-e', js, str(ROOT / 'index.html')],
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def chunks_of(text):
    return [c.strip() for c in CLAUSE.split(text) if c.strip()]


def syllables(text):
    return len(HANGUL.findall(text))


def segments(mono, sr):
    hop = int(sr * FRAME)
    env = np.array([np.sqrt((mono[i:i + hop] ** 2).mean())
                    for i in range(0, len(mono) - hop, hop)])
    loud = env > env.max() * THRESH
    gap = int(MIN_GAP / FRAME)
    out, i, n = [], 0, len(loud)
    while i < n:
        if loud[i]:
            j = last = i
            while j < n:
                if loud[j]:
                    last = j
                elif j - last >= gap:
                    break
                j += 1
            out.append((i * FRAME, (last + 1) * FRAME))
            i = j
        else:
            i += 1
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    path, block = sys.argv[1], sys.argv[2]
    write = '--write' in sys.argv

    conv_id, speaker = block.rsplit('-', 1)
    conv = next((c for c in conversations() if c['id'] == conv_id), None)
    if not conv:
        sys.exit(f'no conversation {conv_id}')
    lines = [l for l in conv['lines'] if l['w'] == speaker]
    if not lines:
        sys.exit(f'no lines for speaker {speaker} in {conv_id}')

    data, sr = sf.read(path, always_2d=True)
    mono = data.mean(axis=1)
    segs = segments(mono, sr)

    expected = [chunks_of(l['ko']) for l in lines]
    want = sum(len(c) for c in expected)

    print(f'{block}: {len(lines)} lines, {len(mono)/sr:.2f}s audio')
    print(f'  predicted {want} clause chunks, detected {len(segs)} segments')

    if want != len(segs):
        print('  MISMATCH — not splitting. The recording does not match the script.')
        print('  Most likely the block was pasted with a line missing or added, or the')
        print('  model ran two clauses together. Re-generate this block and try again.')
        sys.exit(1)

    # group segments into lines, in order
    grouped, k = [], 0
    for cs in expected:
        take = segs[k:k + len(cs)]
        k += len(cs)
        grouped.append((take[0][0], take[-1][1]))

    # Sanity check: every chunk should be spoken at about the same rate. A
    # grouping that has slipped shows up as one chunk far faster or slower
    # than its neighbours, which no correct alignment produces.
    #
    # Only chunks of three syllables or more count. Every utterance carries a
    # fixed onset and decay, so a one-syllable interjection like 네 measures
    # two or three times the seconds-per-syllable of a real phrase no matter
    # how well aligned it is — including them makes a correct split look wrong.
    flat = [c for cs in expected for c in cs]
    rates = np.array([(seg[1] - seg[0]) / syllables(c)
                      for seg, c in zip(segs, flat) if syllables(c) >= 3])
    spread = rates.std() / rates.mean()
    print(f'  speaking rate {rates.mean():.3f}s/syllable, spread {spread*100:.0f}%'
          f' ({"consistent — alignment is right" if spread < 0.35 else "UNEVEN — check the audio"})')
    print()

    OUT.mkdir(parents=True, exist_ok=True)
    for i, (l, (a, b)) in enumerate(zip(lines, grouped), 1):
        idx = conv['lines'].index(l)
        name = f'{conv_id}-{idx:02d}'
        dur = b - a
        rate = dur / max(1, syllables(l['ko']))
        print(f'  {name}  {dur:5.2f}s  {syllables(l["ko"]):>2} syl  {rate:.3f}s/syl   {l["ko"][:38]}')
        if write:
            s = max(0, int((a - PAD) * sr))
            e = min(len(mono), int((b + PAD) * sr))
            sf.write(str(OUT / f'{name}.mp3'), mono[s:e], sr, format='MP3')

    if write:
        print(f'\n  wrote {len(lines)} clips to {OUT.relative_to(ROOT)}/')
    else:
        print('\n  dry run — pass --write to export the clips')


if __name__ == '__main__':
    main()
