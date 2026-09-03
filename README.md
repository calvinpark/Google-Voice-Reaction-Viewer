# Google Voice Reaction Viewer

Firefox extension for the Google Voice web app. iPhone tapback reactions arrive over
SMS as text rows like `Loved “See you at the park at 3, bring the frisbee”`. The extension finds those rows, locates
the message they quote, and puts the emoji (❤️ 👍 👎 😂 ‼️ ❓, or an iOS 18 custom emoji)
as a badge on that message. The text row stays, dimmed; clicking it scrolls to the
quoted message. Removals delete the badge. Render-only: nothing is sent, stored, or
requested from the network.

## Files

```
manifest.json        MV3 manifest for Chrome/Brave — the main target (content script on
                     voice.google.com, no permissions; name "Reaction Viewer for Google Voice")
manifest.firefox.json MV2 manifest for Firefox/AMO (gecko id; kept for the AMO listing)
build-chrome.mjs     builds the Chrome Web Store zip from the root manifest (npm run build:chrome)
content.js           the whole extension: parsing, matching, badges, loop protection
styles.css           badge, dimmed rows, click-to-scroll highlight
icons/               icon.svg source + 48/96/128 PNG (256 for listings)
amo-metadata.json    listing metadata for `web-ext sign --amo-metadata`
web-ext-config.mjs   web-ext defaults (ignore list, artifacts dir, sign channel)
test/                node unit tests + headless Firefox integration test
CLAUDE.md            design notes and DOM facts
```

## Develop

```
npm install                 # web-ext
npm test                    # unit tests for the parser (node --test)
npm run lint                # web-ext lint
npm start                   # web-ext run: launches Firefox with a dev profile, reloads on save
```

`npm start` uses a profile named `gv-tapbacks-dev` (created on first run, kept between
runs). Sign in to Google Voice in it once. Manual alternative: `about:debugging` →
This Firefox → Load Temporary Add-on → `manifest.json`; temporary add-ons are removed
when Firefox exits.

Headless Firefox integration test (needs `firefox-esr` on PATH, or `FIREFOX_BIN=…`;
serves a fixture on port 80, so run with privileges that can bind it):

```
python3 test/firefox_test.py
```

## Loop protection

`content.js` re-scans the conversation on DOM mutations. Two independent breakers stop
it if it ever feeds itself: `MAX_SELF_TRIGGERED_PASSES` within `LOOP_WINDOW_MS`, and a
hard cap `MAX_TOTAL_PASSES` per conversation. Both are constants at the top of
`content.js`; both disconnect the observer and log a `console.error`. Set
`DEBUG_FORCE_LOOP: true` once to prove they trip, then set it back.

## Publish

**Manual upload** (no API key needed): run `npm run build`, then upload the
`.zip` from `dist/` at https://addons.mozilla.org/developers/addon/submit/.

**Chrome Web Store** (main target): `npm run build:chrome` → `dist/…-chrome.zip`
from the root MV3 manifest. Upload at https://chrome.google.com/webstore/devconsole.
Installs in Brave too. For local use: chrome://extensions → Load unpacked → this
repo's root folder.

**Firefox/AMO**: `manifest.firefox.json` is the MV2 manifest (MV3 content scripts
on Firefox need a user-granted host permission). To build for AMO, swap it in as
`manifest.json` first; the web-ext scripts (`build`, `lint`, `start`, `sign:*`)
and `test/firefox_test.py` assume the MV2 manifest is at the root.

**CLI signing** (requires API key): create one at
https://addons.mozilla.org/developers/addon/api/key/ and export
`WEB_EXT_API_KEY` / `WEB_EXT_API_SECRET`.

```
npm run build               # dist/google_voice_reaction_viewer-<version>.zip
npm run sign:unlisted       # signed .xpi for self-distribution (installs in release Firefox)
npm run sign:listed         # submit for public listing on AMO
```

`amo-metadata.json` holds the listing text, category, and license (MIT).
Bump `version` in `manifest.json` before each sign; AMO rejects a reused
version number.
