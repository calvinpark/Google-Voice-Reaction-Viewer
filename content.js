/*
 * Google Voice Reaction Viewer — content script (Manifest V2, Firefox).
 *
 * Google Voice shows iMessage tapback reactions as plain text rows such as
 *   Loved “See you at the park at 3, bring the frisbee”
 * This script finds those rows, locates the message they quote, puts an emoji
 * badge on that message's bubble, dims the text row, and makes the text row
 * scroll to the quoted message when clicked. Pure DOM; no extension APIs.
 *
 * Design notes are in CLAUDE.md. Loop protection is mandatory:
 *   1. detection-based break  (MAX_SELF_TRIGGERED_PASSES within LOOP_WINDOW_MS)
 *   2. hard cap on passes     (MAX_TOTAL_PASSES, per conversation)
 */
(function (root) {
  'use strict';

  const VERSION = '0.1.1';
  const TAG = '[gv-tapback]';

  const CONFIG = {
    // Hard cap on full passes per conversation. Hard requirement; do not remove.
    MAX_TOTAL_PASSES: 500,
    // Detection-based break: consecutive DOM-changing passes that start less than
    // LOOP_WINDOW_MS after the previous DOM-changing pass. A correct build never
    // exceeds 1; a runaway loop runs at animation-frame rate (~16 ms).
    MAX_SELF_TRIGGERED_PASSES: 3,
    LOOP_WINDOW_MS: 250,
    // Positive control. When true, every pass inserts (and removes) one unmarked
    // node after the pass returns, which looks like an external mutation and
    // schedules another pass. Both breakers must trip. Leave false.
    DEBUG_FORCE_LOOP: false,
    // console.debug one line per pass.
    DEBUG_LOG: false,
  };

  // Attribute on every node this extension inserts.
  const EXT_ATTR = 'data-gv-tapback-ext';
  // Attributes set on Google's own elements. Attributes, never classes: Angular
  // owns the class attribute and may rewrite it; it leaves foreign data-* alone.
  const A = {
    role: 'data-gv-tapback-role',     // li: "reaction" | "original"
    state: 'data-gv-tapback-state',   // li: matched | unmatched | removed | attachment
    dimmed: 'data-gv-tapback-dimmed', // div.message-row of a reaction row
    linked: 'data-gv-tapback-linked', // div.message-row that scrolls to an original on click
    flash: 'data-gv-tapback-flash',   // bubble of the original while highlighted
  };

  // ---- reaction text patterns -------------------------------------------------

  const STANDARD = {
    'Loved': '❤️',
    'Liked': '👍',
    'Disliked': '👎',
    'Laughed at': '😂',
    'Emphasized': '‼️',
    'Questioned': '❓',
  };
  // Removal wording is from recall, unverified. A wrong string leaves the row untouched.
  const REMOVAL_NOUNS = {
    'a heart': '❤️',
    'a like': '👍',
    'a dislike': '👎',
    'a laugh': '😂',
    'an exclamation': '‼️',
    'an exclamation mark': '‼️',
    'a question mark': '❓',
    'a question': '❓',
  };
  // Attachment wording is from recall, unverified.
  const ATTACHMENT_NOUNS = 'image|photo|picture|attachment|video|movie|audio message|audio|voice message|link|sticker|gif|file|location|contact';

  const VERBS = Object.keys(STANDARD).join('|');
  const QO = '[“"]';
  const QC = '[”"]';
  const RX_STANDARD = new RegExp('^(' + VERBS + ') ' + QO + '([\\s\\S]+)' + QC + '$');
  // iOS 18 custom emoji tapback: Reacted 😂 to “…” (verified wording: "reacted <emoji> to").
  const RX_EMOJI = new RegExp('^Reacted (\\S+) to ' + QO + '([\\s\\S]+)' + QC + '$');
  const RX_REMOVAL = new RegExp('^Removed (.+?) from ' + QO + '([\\s\\S]+)' + QC + '$');
  const RX_ATTACHMENT = new RegExp('^(' + VERBS + ') an? (?:' + ATTACHMENT_NOUNS + ')$', 'i');

  const RX_EMOJI_CHARS = /\p{Extended_Pictographic}|[\uFE0E\uFE0F\u200D\u20E3]|[\u{1F3FB}-\u{1F3FF}]/gu;
  const RX_ONLY_EMOJI = /^(?:\p{Extended_Pictographic}|[\uFE0E\uFE0F\u200D\u20E3]|[\u{1F3FB}-\u{1F3FF}])+$/u;

  function normalize(s) {
    return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function stripEmoji(s) {
    return normalize(String(s || '').replace(RX_EMOJI_CHARS, ''));
  }

  // Google Voice renders emoji inside messages as <img alt="🙏" class="emoji">,
  // so textContent drops them. Rebuild the text from text nodes plus img alt.
  function extractText(el) {
    let out = '';
    const walk = function (node) {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) {
          out += c.nodeValue;
        } else if (c.nodeType === 1) {
          if (c.hasAttribute(EXT_ATTR)) continue;
          const tag = c.tagName;
          if (tag === 'IMG') out += c.getAttribute('alt') || '';
          else if (tag === 'BR') out += '\n';
          else walk(c);
        }
      }
    };
    walk(el);
    return out;
  }

  // Parse one row's text. Returns null for ordinary messages.
  //   { kind: 'add' | 'remove', emoji, quote }   or   { kind: 'attachment', emoji }
  function parseReaction(text) {
    let m;
    if ((m = RX_STANDARD.exec(text))) {
      return { kind: 'add', emoji: STANDARD[m[1]], quote: normalize(m[2]) };
    }
    if ((m = RX_EMOJI.exec(text))) {
      if (!RX_ONLY_EMOJI.test(m[1])) return null;
      return { kind: 'add', emoji: m[1], quote: normalize(m[2]) };
    }
    if ((m = RX_REMOVAL.exec(text))) {
      const what = normalize(m[1]);
      const emoji = REMOVAL_NOUNS[what.toLowerCase()] || (RX_ONLY_EMOJI.test(what) ? what : null);
      if (!emoji) return null;
      return { kind: 'remove', emoji: emoji, quote: normalize(m[2]) };
    }
    if ((m = RX_ATTACHMENT.exec(text))) {
      const verb = Object.keys(STANDARD).find(function (v) { return v.toLowerCase() === m[1].toLowerCase(); });
      return { kind: 'attachment', emoji: STANDARD[verb], quote: null };
    }
    return null;
  }

  // quote: text quoted by the reaction row; candidate: text of an earlier row.
  function textsEqual(quote, candidate) {
    if (quote === candidate) return true;
    const a = stripEmoji(quote);
    const b = stripEmoji(candidate);
    if (a && a === b) return true;
    // A shortened quote ending in an ellipsis matches a message it prefixes.
    const cut = /(…|\.\.\.)$/.exec(quote);
    if (cut) {
      const prefix = quote.slice(0, cut.index).trim();
      if (prefix.length >= 12 && candidate.startsWith(prefix)) return true;
    }
    return false;
  }

  // ---- DOM accessors (selectors verified on the live page 2026-08-26) ---------

  function threadEl() {
    return document.querySelector('gv-thread-details');
  }
  function rowsOf(thread) {
    const out = [];
    const lis = thread.querySelectorAll('gv-message-list ul.list > li');
    for (const li of lis) if (li.querySelector('gv-message-item')) out.push(li);
    return out;
  }
  function annotationOf(li) { return li.querySelector('gv-annotation.content'); }
  function bubbleOf(li) { return li.querySelector('div.subject-content-container.bubble'); }
  function messageRowOf(li) { return li.querySelector('div.message-row'); }

  // Every row has a screen-reader div: "Message from <sender>, <text>, <date>."
  // Outgoing rows say "Message from you". span.sender exists only on end-of-cluster rows.
  function senderOf(li) {
    const hidden = li.querySelector('div.cdk-visually-hidden');
    const m = /^Message from (.+?), /.exec(normalize(hidden ? hidden.textContent : ''));
    if (m) return m[1];
    const span = li.querySelector('span.sender');
    return span ? normalize(span.textContent) : '';
  }

  function convKey() {
    let id = '';
    try { id = new URLSearchParams(location.search).get('itemId') || ''; } catch (e) { /* ignore */ }
    return id;
  }

  // ---- badges ------------------------------------------------------------------

  function badgeKey(sender, emoji) { return sender + '|' + emoji; }

  function badgeContainer(li, create) {
    const bubble = bubbleOf(li);
    if (!bubble) return null;
    let c = bubble.querySelector(':scope > .gv-tapback-badges');
    if (!c && create) {
      c = document.createElement('span');
      c.className = 'gv-tapback-badges';
      c.setAttribute(EXT_ATTR, '');
      bubble.appendChild(c);
    }
    return c;
  }

  // Returns true when a node was inserted.
  function addBadge(originalLi, emoji, sender) {
    const c = badgeContainer(originalLi, true);
    if (!c) return false;
    const key = badgeKey(sender, emoji);
    for (const b of c.children) if (b.getAttribute('data-gv-tapback-key') === key) return false;
    const b = document.createElement('span');
    b.className = 'gv-tapback-badge';
    b.setAttribute(EXT_ATTR, '');
    b.setAttribute('data-gv-tapback-key', key);
    b.setAttribute('title', sender ? sender + ' reacted ' + emoji : 'Reacted ' + emoji);
    b.textContent = emoji;
    c.appendChild(b);
    originalLi.setAttribute(A.role, 'original');
    return true;
  }

  // Returns true when a node was removed. Prefers the same sender, else any badge with that emoji.
  function removeBadge(originalLi, emoji, sender) {
    const c = badgeContainer(originalLi, false);
    if (!c) return false;
    const key = badgeKey(sender, emoji);
    let victim = null;
    for (const b of c.children) {
      const k = b.getAttribute('data-gv-tapback-key') || '';
      if (k === key) { victim = b; break; }
      if (!victim && k.endsWith('|' + emoji)) victim = b;
    }
    if (!victim) return false;
    victim.remove();
    if (!c.children.length) c.remove();
    return true;
  }

  // ---- reaction rows -----------------------------------------------------------

  const links = new WeakMap(); // reaction li -> original li

  function onReactionClick(ev) {
    const row = ev.currentTarget;
    const li = row.closest('li');
    const target = li && links.get(li);
    if (!target || !target.isConnected) return;
    ev.preventDefault();
    ev.stopPropagation();
    try { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { target.scrollIntoView(); }
    const bubble = bubbleOf(target);
    if (bubble) {
      bubble.removeAttribute(A.flash);
      void bubble.offsetWidth; // restart the CSS animation
      bubble.setAttribute(A.flash, '');
      setTimeout(function () { bubble.removeAttribute(A.flash); }, 2600);
    }
  }

  // Sets role/state, dims the row once, links it to the original when known.
  // Returns 1 when the dim attribute was newly applied (a visible change), else 0.
  function markReaction(li, state, originalLi) {
    let changes = 0;
    li.setAttribute(A.role, 'reaction');
    li.setAttribute(A.state, state);
    const row = messageRowOf(li);
    if (row && !row.hasAttribute(A.dimmed)) {
      row.setAttribute(A.dimmed, '');
      changes = 1;
    }
    if (originalLi) {
      links.set(li, originalLi);
      if (row && !row.hasAttribute(A.linked)) {
        row.setAttribute(A.linked, '');
        row.addEventListener('click', onReactionClick);
      }
    }
    return changes;
  }

  function findOriginal(rows, index, quote, textOf) {
    for (let i = index - 1; i >= 0; i--) {
      const li = rows[i];
      const t = textOf(li);
      if (!t) continue;
      if (parseReaction(t)) continue; // another reaction row is never the original
      if (textsEqual(quote, t)) return li;
    }
    return null;
  }

  // One full pass over the open conversation. Returns the number of visible DOM changes.
  function processThread(thread) {
    const rows = rowsOf(thread);
    const cache = new Map();
    const textOf = function (li) {
      if (!cache.has(li)) {
        const a = annotationOf(li);
        cache.set(li, a ? normalize(extractText(a)) : '');
      }
      return cache.get(li);
    };
    let changes = 0;
    for (let i = 0; i < rows.length; i++) {
      const li = rows[i];
      const st = li.getAttribute(A.state);
      if (st === 'matched' || st === 'removed' || st === 'attachment') continue; // terminal
      const text = textOf(li);
      if (!text) continue;
      const r = parseReaction(text);
      if (!r) continue;
      if (r.kind === 'attachment') {
        changes += markReaction(li, 'attachment', null);
        continue;
      }
      const original = findOriginal(rows, i, r.quote, textOf);
      if (!original) {
        // Retried on every pass: scroll-back may prepend the original later.
        changes += markReaction(li, 'unmatched', null);
        continue;
      }
      const sender = senderOf(li);
      if (r.kind === 'add') {
        if (addBadge(original, r.emoji, sender)) changes++;
        changes += markReaction(li, 'matched', original);
      } else {
        if (removeBadge(original, r.emoji, sender)) changes++;
        changes += markReaction(li, 'removed', original);
      }
    }
    return changes;
  }

  // ---- observer + loop protection -----------------------------------------------

  const state = {
    halted: false,
    haltReason: null,
    convKey: null,
    totalPasses: 0,      // passes in this conversation (hard cap)
    streak: 0,           // consecutive DOM-changing passes inside LOOP_WINDOW_MS
    lastChangeAt: 0,
    rafPending: false,
    lifetimePasses: 0,
    lastPass: null,
  };

  let observer = null;

  function log() {
    if (CONFIG.DEBUG_LOG) console.debug.apply(console, [TAG].concat(Array.prototype.slice.call(arguments)));
  }

  function halt(reason) {
    state.halted = true;
    state.haltReason = reason;
    if (observer) observer.disconnect();
    console.error(TAG + ' ' + reason);
  }

  function isOurs(node) {
    const el = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
    return !!(el && el.closest && el.closest('[' + EXT_ATTR + ']'));
  }

  function recordIsOurs(rec) {
    if (isOurs(rec.target)) return true;
    const nodes = Array.prototype.concat.call([], Array.from(rec.addedNodes), Array.from(rec.removedNodes));
    return nodes.length > 0 && nodes.every(isOurs);
  }

  function onMutations(records) {
    if (state.halted) return;
    let external = false;
    for (const rec of records) {
      if (!recordIsOurs(rec)) { external = true; break; }
    }
    if (external) schedule();
  }

  function schedule() {
    if (state.halted || state.rafPending) return;
    state.rafPending = true;
    requestAnimationFrame(function () {
      state.rafPending = false;
      pass('mutation');
    });
  }

  function pass(reason) {
    if (state.halted) return;
    const key = convKey();
    if (key !== state.convKey) {
      state.convKey = key;
      state.totalPasses = 0;
      state.streak = 0;
      state.lastChangeAt = 0;
    }
    state.totalPasses++;
    state.lifetimePasses++;
    if (state.totalPasses > CONFIG.MAX_TOTAL_PASSES) {
      halt('hard cap reached: ' + state.totalPasses + ' passes in this conversation (MAX_TOTAL_PASSES=' +
        CONFIG.MAX_TOTAL_PASSES + '); observer disconnected');
      return;
    }

    let changes = 0;
    const thread = threadEl();
    if (thread) changes = processThread(thread);

    if (CONFIG.DEBUG_FORCE_LOOP) {
      changes++;
      setTimeout(function () {
        const n = document.createElement('i');
        n.className = 'gv-tapback-debug-loop';
        document.body.appendChild(n);
        n.remove();
      }, 0);
    }

    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (changes > 0) {
      state.streak = (now - state.lastChangeAt < CONFIG.LOOP_WINDOW_MS) ? state.streak + 1 : 1;
      state.lastChangeAt = now;
      if (state.streak > CONFIG.MAX_SELF_TRIGGERED_PASSES) {
        halt('loop detected: ' + state.streak + ' consecutive DOM-changing passes within ' + CONFIG.LOOP_WINDOW_MS +
          'ms (MAX_SELF_TRIGGERED_PASSES=' + CONFIG.MAX_SELF_TRIGGERED_PASSES + '); observer disconnected');
        return;
      }
    } else {
      state.streak = 0;
    }

    // Discard the records this pass produced so they never schedule another pass.
    if (observer) observer.takeRecords();
    state.lastPass = { reason: reason, changes: changes, rows: thread ? rowsOf(thread).length : 0, at: now };
    log('pass', reason, 'changes=' + changes, 'total=' + state.totalPasses, 'streak=' + state.streak);
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver(onMutations);
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
    pass('initial');
  }

  // Test hook: clears the halt, reconnects, and runs a pass.
  function reset() {
    state.halted = false;
    state.haltReason = null;
    state.totalPasses = 0;
    state.streak = 0;
    state.lastChangeAt = 0;
    state.rafPending = false;
    if (observer) observer.disconnect();
    observer = null;
    start();
  }

  const api = {
    VERSION: VERSION,
    CONFIG: CONFIG,
    state: state,
    pass: pass,
    reset: reset,
    parseReaction: parseReaction,
    extractText: extractText,
    normalize: normalize,
    stripEmoji: stripEmoji,
    textsEqual: textsEqual,
    senderOf: senderOf,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // node unit tests
    return;
  }
  root.__gvTapback = api;
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
