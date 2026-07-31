# 한빛 Hanbit — learn Korean, fast

A Korean trainer built for one thing: getting you to usable Korean in as few
minutes of study as possible. No ads, no accounts, no streak guilt, no hearts.

**Open it:** https://bloxboss3-dotcom.github.io/Hangul-Korean/

On a phone, add it to your home screen — it then launches full screen and works
with no signal at all.

- **iPhone / iPad:** Share → *Add to Home Screen*
- **Android:** ⋮ menu → *Install app* / *Add to Home screen*

---

## What it does

**Reading, from scratch.** Ten Hangul units teach the alphabet through the shapes
your mouth makes, ordered so you can read real words from the second unit onward.
It ends with the eight sound-change rules that make spoken Korean diverge from its
spelling — the thing most apps skip, and the reason learners who can read still
cannot follow speech.

**Twelve units of real grammar and vocabulary**, chosen for frequency first. Every
unit pairs a few grammar patterns with the words that make those patterns usable the
same day.

**FSRS spaced repetition.** The same forgetting-curve model serious Anki users run,
with explicit learning steps in front of it so what you met yesterday is waiting for
you today. New material throttles itself back automatically when too much is still
shaky.

**A ladder of skills per item.** Recognise it → understand it by ear → write it →
use it in a sentence → say it out loud. Each rung is scheduled separately and only
opens once the one below it is stable.

**Speaking, scored.** Record yourself, see your rhythm against the syllable beats
Korean actually wants, play it back against a native voice, and — where the browser
has a speech recogniser — get a jamo-level score of what you actually said, with the
wrong syllable pointed at.

**Twelve conversations, one per unit.** Each dialogue uses only material you have
already met. Every chunk of Korean is colour-linked to the English it corresponds
to, with a literal word-for-word reading alongside the natural one, so the grammar
becomes visible instead of being explained. Then you take a side and say your half
out loud while the app plays the other part.

**Weak-spot tracking.** It remembers not just that you missed something but *which
wrong answer you reached for*, because most chronic errors are two similar items
colliding rather than one hard item. Those pairs get a drill that puts them side by
side and forces the discrimination.

---

## Privacy

Everything lives in your browser's local storage. There is no account, no server,
no analytics, and no third-party request of any kind — the Korean text uses your
system font stack and the celebration sounds are synthesised on the fly.

The one exception is opt-in and labelled as such: **pronunciation checking** hands
your recording to the browser's own speech recogniser, which on Chrome and Safari
runs in the cloud. Turn it off in Settings and the app never touches a network
again after the first load. Recordings are never stored — they live in memory until
the next one replaces them.

Because progress lives in the browser, clearing site data wipes it. Settings has
export and import for backups.

---

## Repository layout

| File | What it is |
| --- | --- |
| `index.html` | The entire app — markup, styles, curriculum and scheduler in one file with no build step |
| `manifest.webmanifest` | Makes it installable to a home screen |
| `sw.js` | Service worker; caches the app so it opens offline |
| `offline.html` | Shown if the app is opened offline before it was ever cached |
| `icons/` | Home-screen and browser-tab icons |
| `tools/check.mjs` | Smoke test — parses the app, validates the conversation data, checks the PWA plumbing |
| `.github/workflows/pages.yml` | Runs the check, then deploys to GitHub Pages on every push to `main` |

## Working on it

There is no toolchain. Open `index.html` in a browser and edit it.

```sh
node tools/check.mjs      # parse + data validation, same as CI
npx http-server -p 8080   # serve it, if you want the service worker and microphone to work
```

Microphone access and service workers both require `https://` or `localhost`, so
speaking practice will not work from a `file://` URL — the rest of the app will.

### One-time setup for the live site

GitHub Pages needs to be told to deploy from Actions: **Settings → Pages → Build and
deployment → Source → GitHub Actions**. After that every push to `main` publishes.
