# Google Voice Reaction Viewer

Browser extension that renders iMessage-style tapback reactions as emoji badges
on the reacted-to message in the Google Voice web UI. Main target since
2026-09-02: Chrome/Brave (root manifest.json, MV3, name "Reaction Viewer for
Google Voice"; published to the Chrome Web
Store). Firefox MV2 manifest kept as manifest.firefox.json for the AMO listing.

MV2 because MV3 content scripts on Firefox require a user-granted host
permission (Bugzilla 1745819), and temporary loads via about:debugging
never grant it (web-ext #2980). MV2 has no removal date in Firefox.
Chrome (2026-09-02): the Chrome Web Store only accepts MV3, so the root manifest
is MV3; same content.js/styles.css/icons, no code changes. Store name "Reaction
Viewer for Google Voice" (decided 2026-09-02 — CWS branding rules reject titles
leading with a Google trademark). `npm run build:chrome`. The web-ext scripts and
test/firefox_test.py expect the MV2 manifest at the root — swap
manifest.firefox.json in before using them.

Status 2026-08-27: built, validated, and visually tested in a signed-in Firefox profile.
0.1.1 submitted to addons.mozilla.org on 2026-08-27 (listed channel, Developer Hub
upload form, validation 0 errors / 0 warnings); awaiting review. 0.1.0 was submitted
earlier the same day and shows "Disabled by Mozilla" after 0.1.1 went in. License: MIT.

## What it does

Google Voice shows tapback reactions as separate messages like:
`Loved “See you at the park at 3, bring the frisbee”`

The extension detects those rows, finds the original they quote, renders an
emoji badge on the original's bubble, dims the reaction row (never hides it),
and makes the dimmed row scroll to the original on click.

## Files

```
manifest.json        MV3 manifest (Chrome/Brave, the main target); content script on
                     https://voice.google.com/*; no permissions
manifest.firefox.json MV2 manifest for Firefox/AMO; gecko id
                     {90091e07-01ce-012e-ac71-017071e77e12}; data_collection_permissions none
content.js           everything: parsing, matching, badges, observer, loop protection
styles.css           badge strip, dimmed rows, click-to-scroll flash
icons/icon.svg       source; icon-48/96/128.png used by the manifest, icon-256.png for listings
amo-metadata.json    listing metadata for `web-ext sign --amo-metadata`; license MIT
web-ext-config.mjs   web-ext defaults: ignore list, dist/ artifacts, sign channel unlisted
package.json         scripts: test (node --test), lint, build, start (web-ext run), sign:*
test/parse.test.js   unit tests for parseReaction / textsEqual / normalize
test/firefox_test.py headless Firefox integration test (Marionette, no deps); see below
test/make_fixture.py generates test/fixtures/thread.html (synthetic thread, fake names)
```

## DOM structure (verified 2026-08-26 on live Google Voice, Chrome, several threads)

```
gv-thread-details
  gv-message-list
    div.messages-container
      ul.list                       ← persists across conversation switches; Angular
        li                            recreates the <li> children per conversation
          gv-message-item
            div.full-container.(incoming|outgoing).[start-of-cluster].[end-of-cluster]
              div.container
                div.status  (only on end-of-cluster rows)
                  div.sender-timestamp
                    span.sender
                    span.timestamp
                div.cdk-visually-hidden   "Message from <sender|you>, <text>, <Weekday, Month D YYYY, H:MM AM/PM>."
                                          present on EVERY row; the extension reads the sender from it
                div.message-row
                  gv-avatar
                  div.subject-content-container.bubble   (position: relative on the live page)
                    div
                      gv-annotation.content   ← message text; emoji are <img alt="🙏" class="emoji">
                  div.options-button-container
```

Facts that shaped the code:
- Emoji inside messages are `<img alt="…">`, so textContent drops them. `extractText()`
  rebuilds text from text nodes plus img alt; `textsEqual()` also compares emoji-stripped.
- Links render as `<a>` with the URL as text; textContent is unaffected.
- No virtual scrolling in the detail pane. The sidebar thread list uses
  `cdk-virtual-scroll-viewport`; messages are plain `<ul>/<li>`.
- A thread opens with 15 rows; scroll-to-top prepends up to 100 older rows and keeps
  existing ones (observed 15 → 115 → 218 on one thread).
- The `ul.list` element is reused across conversations (foreign children injected into
  it leak into the next conversation); Angular-managed `<li>` rows are recreated.
  The extension keys per-conversation counters on the `itemId` query parameter.
- Reaction rows have no distinguishing class or element; only their text.
- Quotes are curly (“ ”); straight quotes are accepted too.

## Selector strategy

Anchor on custom element tag names (`gv-message-item`, `gv-annotation`,
`gv-thread-details`, `gv-message-list`) and semantic class names
(`.full-container`, `.message-row`, `.subject-content-container.bubble`, `.content`,
`.cdk-visually-hidden`). Never use Angular-generated attributes (`_ngcontent-*`, `ng-c*`).

State is stored in `data-gv-tapback-*` attributes on Google's elements, never in
classes (Angular owns the class attribute). Every node the extension inserts carries
`data-gv-tapback-ext`.

## Reaction patterns (content.js `parseReaction`)

Standard: `Loved|Liked|Disliked|Laughed at|Emphasized|Questioned “…”` → ❤️ 👍 👎 😂 ‼️ ❓
iOS 18 custom emoji: `Reacted <emoji> to “…”` → that emoji (wording verified; the emoji arrives as an img)
Removals (wording from recall, unverified): `Removed a heart|a like|a dislike|a laugh|an exclamation|a question mark from “…”`,
and `Removed <emoji> from “…”` → delete that badge
Attachments (wording unverified): `Loved an image`, `Liked an attachment`, … → dim only
A wrong string leaves the row untouched.

## Matching

1. Read `gv-annotation.content` via `extractText()` (never innerText of the item).
2. Parse. Non-reactions are skipped.
3. Walk backward through earlier `<li>` rows; skip rows that are themselves reactions;
   compare normalized text, then emoji-stripped text, then ellipsis-prefix (quote ends
   with … and is ≥ 12 chars).
4. Match: append `<span class="gv-tapback-badges">` to the original's bubble with one
   `<span class="gv-tapback-badge" data-gv-tapback-key="<sender>|<emoji>">` per
   sender+emoji; mark the reaction row `matched` (terminal), dim its `div.message-row`,
   link it (click → `scrollIntoView` + 2.4 s flash on the original bubble).
5. No match: state `unmatched`, dimmed once, not linked, retried on every pass (scroll-back
   may prepend the original).
6. Removal: delete the badge for that sender+emoji (fallback: any badge with that emoji);
   state `removed` (terminal), dimmed, linked.
7. Attachment: state `attachment` (terminal), dimmed, not linked.

## Observer and loop protection (hard requirement: both layers mandatory)

Observer on `document.body`, `{childList, subtree}`, debounced to one pass per
animation frame. Callback ignores records whose target/added/removed nodes are all
extension-owned. After each pass, `observer.takeRecords()` discards the pass's own
records. MutationObserver callbacks fire after the current script completes, so a
synchronous "isProcessing" flag cannot gate them (verified on the live page).

Layer 1, detection-based: `streak` counts consecutive DOM-changing passes that start
less than `LOOP_WINDOW_MS` (250) after the previous DOM-changing pass. A correct build
never exceeds 1; a runaway loop runs at ~16 ms spacing. Above
`MAX_SELF_TRIGGERED_PASSES` (3): disconnect, `console.error`, stop.
Earlier draft ("passes with no external record between them") could never fire,
because takeRecords removes exactly those records; this timing form also catches the
indirect loop where our badge insert makes Angular re-render.

Layer 2, hard cap: `MAX_TOTAL_PASSES` (500) per conversation (reset when `itemId`
changes). Above it: disconnect, `console.error`, stop. The cap is a hard requirement; do not
recommend removing it. Measured 2026-08-26: idle 15 s = 0–1 pass; conversation switch
= 1 pass; scroll-back loading 100 rows = 2 passes; typing in the compose box unmeasured.

Positive control: `DEBUG_FORCE_LOOP: true` makes each pass insert-and-remove one
unmarked node in a `setTimeout(0)` (after takeRecords), which schedules the next pass.
Both breakers tripped in Chrome with the exact lines:
`[gv-tapback] loop detected: 4 consecutive DOM-changing passes within 250ms (MAX_SELF_TRIGGERED_PASSES=3); observer disconnected`
`[gv-tapback] hard cap reached: 501 passes in this conversation (MAX_TOTAL_PASSES=500); observer disconnected`
(second run with `MAX_SELF_TRIGGERED_PASSES` set huge; ~9 s to 501 passes).

Test hook: `__gvTapback` (in the content-script scope; visible in the page scope only
when content.js is injected directly) exposes `CONFIG`, `state`, `pass()`, `reset()`,
and the pure functions.

## Verification (2026-08-26)

Chrome, Claude-in-Chrome, content.js + styles.css injected into live voice.google.com:
- A real SMS thread: 13 real reaction rows across 218 loaded rows (Loved, Liked,
  Questioned, a quote containing 🙏🙏🙏 images) all matched; badges, dim, link, flash OK.
- Injected rows: iOS 18 `Reacted <img 😂> to “…”`, removal, unmatched → later original
  prepended → matched, attachment, second reaction type, duplicate (deduped).
- Conversation switch resets counters; idle 10 s = 0 passes; both breakers (above).
Firefox 153.1 ESR headless (container), `python3 test/firefox_test.py`: real manifest
installs as a temporary add-on; test build (extra match `http://127.0.0.1/*`) runs on
the synthetic fixture: 14/14 checks, screenshot `test/fixtures/firefox-screenshot.png`.
`web-ext lint`: 0 errors, 0 warnings, 0 notices. `node --test`: 8/8.
Not verified: a real inbound reaction arriving while the extension is running; the
removal and attachment wording; the extension in the maintainer's daily profile.

Firefox match patterns ignore port numbers (bug 1362809); the fixture is served on
port 80 for that reason.

## Design choices (2026-08-26; reversible)

- Badge position: bare emoji at the top corner of the bubble, opposite the avatar side
  (right for incoming, left for outgoing), top-aligned with the bubble edge, hanging 6px
  out — where iMessage puts a tapback (decided 2026-08-27).
  Dimmed rows also get `font-size: 0.85em`.
- Gecko id `{90091e07-01ce-012e-ac71-017071e77e12}`; `strict_min_version` 142.0.
- AMO category `social-communication`; license MIT; sign channel default `unlisted`.
- Icon: original drawing after the 2026 Google Voice logo (gradient handset + quarter
  disc) at 0.92 scale, set right and vertically centred, with a large bare heart emoji
  flush with the left edge and top-aligned with the logo, the way the badge sits on a
  sent bubble (decided 2026-08-27); Material Symbols paths.
- Group threads: one badge per sender+emoji, sender from the hidden screen-reader div.

## Development workflow

1. Edit files in this repo.
2. `npm start` (web-ext run with the `gv-tapbacks-dev` profile, reloads on save), or
   `about:debugging` → This Firefox → Load Temporary Add-on → `manifest.json` (Reload
   after edits; gone on Firefox restart).
3. Console output in DevTools on the Google Voice tab; extension lines start with `[gv-tapback]`.
4. Publish: see README "Publish". `web-ext sign` needs the maintainer's AMO API key; not run.
