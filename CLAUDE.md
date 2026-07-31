# Hanbit — working notes

Single-file Korean trainer. `index.html` is the whole app: markup, styles,
curriculum and scheduler, no build step. Edit it directly.

## Tooling — Runway only

**Runway is the only generation provider. Higgsfield is off the table
permanently — do not call it, do not suggest it, do not price it up.**

- Use Runway for anything generated: images, icons, avatars, video.
- The Runway MCP exposes image, video, upload and task tools. It has **no
  audio endpoint**, even though Runway's web app has an Audio mode with Seed
  Audio 1.0 (real TTS). So spoken Korean cannot be generated from here.
- That is a dead end, not a problem to route around. **If Runway's tools
  cannot do something, drop it and move on** — do not go looking for another
  provider.
- Consequence for the app: the Korean voice stays whatever the browser
  provides. Rank the system voices, be honest about the iOS ceiling, and stop
  there.

## Recorded audio — built, deliberately unused

There is a complete path for replacing the synthesised voice with real
recordings, and it is switched off because the manual work to produce them was
not worth it to the user. **Do not bring it up again unasked.**

If it is ever wanted, everything is in place:

1. `audio-scripts/RECORDING-SCRIPTS.md` — 25 blocks covering all 122 lines,
   generated from the dialogue data. One block per speaker per conversation.
   Only four voices are needed, since the characters recur.
2. Generate each block in Runway (Audio → Seed Audio 1.0).
3. `python3 tools/split-audio.py <clip.mp3> <block-id> --write` cuts a block
   into per-line clips. It predicts the segment count from clause punctuation
   rather than guessing at silence thresholds, and refuses to split when the
   count does not match — so a mis-pasted block fails loudly instead of
   producing silently misaligned audio.
4. `node tools/audio-manifest.mjs` rebuilds `audio/manifest.json`.

The app reads that manifest at boot and prefers a recording wherever one
exists, falling back to synthesis per line. With zero clips it behaves exactly
as it did before — verified. **Do not ship a partially recorded conversation:**
alternating a native voice with a synthesised one inside one dialogue is worse
than using the synthesiser throughout.

## Checks before pushing

```sh
node tools/check.mjs      # parses the app, validates conversation data, PWA plumbing
npx http-server -p 8899 -s .   # serve it; SW and microphone need http, not file://
```

Playwright is at `/opt/node22/lib/node_modules/playwright`. Chromium cannot
reach the public internet from the sandbox, so test against a local server.

## Design commitments — do not quietly break these

- **No punishment mechanics.** No hearts, no lives, no timers, no loss framing.
  Difficulty is the active ingredient and must never be penalised. Coins are the
  one exception and are safe only because they are purely additive: they cannot
  be lost, and nothing they buy makes the course easier.
- **Grading is strict.** Off by one character is a miss (`near`), not a pass —
  in a romanisation the character *is* the content, and 밥/밤 are different
  words. The only grace is a real linguistic one: the dictionary form where the
  conjugated form was wanted.
- **The near-miss power-up must never lie to the scheduler.** It restores the
  streak and session credit; it grades the card a 2, not a 3, and the card still
  returns. A redemption that fooled FSRS would be selling worse Korean.
- **Abandoning a session is not finishing it.** No perfect, no celebration, no
  bonus — but the answers already given still count, because they were real
  retrievals and deleting them costs real memory.
- **Palettes recolour the accent only.** `--good` and `--bad` stay fixed in
  every theme; right and wrong must not change colour.
- **The collection must stay honest.** No real money — coins come only from
  studying. Drop rates are printed on screen, duplicates always refund, and
  pity counters guarantee an epic within 10 eggs and a legendary within 25.
  Nothing a character grants affects difficulty or scheduling; it is paint,
  a palette and a particle colour.
- **No third-party requests.** Same-origin only. The single exception is
  pronunciation checking, which is opt-in, off by default, and labelled as
  sending audio to the browser's speech service.

## The FX canvas — four rules learned the hard way

`#fxlayer` is a full-screen canvas that a bug made pile confetti along the
bottom edge of the phone. Each of these was independently enough to cause it:

- **Clear the whole backing store, in device pixels.** `clearRect` in CSS units
  against a live `window.innerHeight` leaves the strip past it unwiped whenever
  the viewport has moved since the bitmap was sized, and particles crossing it
  paint on top of the previous frame forever.
- **Size the layer from its own box, not from `innerHeight`.** A fixed element
  on iOS occupies the *large* viewport — the height with the toolbar hidden —
  which `innerHeight` under-reports while the toolbar is up. CSS pins the layer
  with `100lvh`; JS measures the layer and matches the bitmap to it.
- **A canvas is a replaced element.** With `width: auto` it takes its width from
  the bitmap's aspect ratio instead of from `inset`, so the box chases its own
  backing store. Both dimensions must be stated in CSS.
- **Step by elapsed time, never per frame.** `+= 1/60` runs at double speed on a
  120Hz phone. Cap the step (1/15s) so a skipped frame nudges the simulation on
  instead of teleporting the whole field.

Off-screen particles get culled, and hiding the tab clears the field — a
backgrounded phone must not come back to confetti frozen in mid-air.

## Known platform ceiling

iOS Safari exposes only the voices that shipped with the system to
`speechSynthesis`. Downloadable Enhanced/Premium Korean voices work in
VoiceOver and Apple's apps but are invisible to web pages, and every iPhone
browser is Safari underneath. Do not write instructions telling iPhone users to
download a better voice — it cannot help. Recorded audio shipped with the app
is the only real fix, and that needs a TTS provider with credit.
