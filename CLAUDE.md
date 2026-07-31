# Hanbit — working notes

Single-file Korean trainer. `index.html` is the whole app: markup, styles,
curriculum and scheduler, no build step. Edit it directly.

## Tooling preferences

**Use Runway for all generation work. Do not use Higgsfield.**

- Runway is the account with credit and is the default for anything generated —
  images, icons, avatars, video.
- Higgsfield is on the free plan at 0 credits. Do not route work to it, and do
  not propose it as an option without checking `balance` first.
- Runway's *product* does have an Audio mode (Lyria 3 Pro). The **MCP
  connection does not expose it** — the 14 tools available are image, video,
  upload and task tools only, so audio cannot be driven from here even though
  it exists in the web app. Say "the tools I can call", not "Runway cannot".
- Lyria is a **music** model in any case, so it would not produce spoken
  Korean dialogue even if it were reachable.
- Korean speech needs a real TTS engine. The only one wired up is Higgsfield's
  `generate_audio` (Seed Audio / ElevenLabs / MiniMax), which is the account
  with no credits — roughly 25 credits would cover all 122 conversation lines.

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
- **No third-party requests.** Same-origin only. The single exception is
  pronunciation checking, which is opt-in, off by default, and labelled as
  sending audio to the browser's speech service.

## Known platform ceiling

iOS Safari exposes only the voices that shipped with the system to
`speechSynthesis`. Downloadable Enhanced/Premium Korean voices work in
VoiceOver and Apple's apps but are invisible to web pages, and every iPhone
browser is Safari underneath. Do not write instructions telling iPhone users to
download a better voice — it cannot help. Recorded audio shipped with the app
is the only real fix, and that needs a TTS provider with credit.
