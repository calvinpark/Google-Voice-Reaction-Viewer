#!/usr/bin/env node
// Regenerates patterns.js (the data-driven pattern tables content.js reads) from
// the raw template files in test/. Run `node tools/gen-tables.mjs` after changing
// either JSON file.
//
//   test/apple-tapback-fallbacks.json   Apple Messages' SMS fallback strings for
//       tapbacks and replies, 44 locales. Rows: [locale, kind, tapback, object, template]
//       kind: add | remove | reply | edited-word | edited-format
//       tapback: like | love | dislike | laugh | emphasize | question | emoji
//       object: text (quoted) | unquoted | count | <attachment noun key>
//       Source: IMSharedUtilities.framework/Versions/A/Resources/IMSharedUtilities.loctable
//       (framework 10.0 build 1000, macOS 26 SDK build 26A432), read 2026-10-30.
//   test/google-messages-fallbacks.json  Google Messages' reaction fallback templates,
//       25 locales. Rows: [locale, kind, target, template]
//       Source: com.google.android.apps.messaging build 20261022_03_RC00 string
//       resources, all locale splits, extracted 2026-10-30.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPLE = JSON.parse(readFileSync(join(ROOT, 'test/apple-tapback-fallbacks.json'), 'utf8'));
const GOOGLE = JSON.parse(readFileSync(join(ROOT, 'test/google-messages-fallbacks.json'), 'utf8'));

const TAPBACK_EMOJI = { like: '👍', love: '❤️', dislike: '👎', laugh: '😂', emphasize: '‼️', question: '❓' };
const ATTACHMENT_OBJECTS = ['image', 'movie', 'attachment', 'location', 'contact', 'audio', 'event',
  'walletpass', 'walletorder', 'photomessage', 'handwritten', 'digitaltouch'];

// Same whitespace treatment as content.js normalize(): zero-width and direction
// marks removed, NBSP and runs of whitespace (hair spaces included) → one space.
function normalize(s) {
  return String(s).replace(/[​‌‎‏⁠﻿]/g, '')
    .replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }
// Quote marks become small classes so a straight-quote variant of the same
// template (older builds keyed these strings with straight quotes) parses too.
const QUOTE_CLASS = { '“': '[“"]', '”': '[”"]', '„': '[„"]', '«': '[«"]', '»': '[»"]', '‘': '[‘\']', '’': '[’\']', '\'': '[\'‘’]' };
function literal(s) {
  let out = '';
  for (const ch of s) out += QUOTE_CLASS[ch] || escapeRe(ch);
  return out;
}
// JS single-quoted string literal for a regex source.
function js(src) { return '\'' + src.replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\''; }

// Build a regex source from a template whose placeholders are listed in order of
// appearance with their roles ('w' = emoji, 'q' = quoted text).
function templateToSource(tpl, placeholderRe, roleOf) {
  const t = normalize(tpl);
  let src = '^', last = 0, i = 0, m;
  const re = new RegExp(placeholderRe.source, 'g');
  while ((m = re.exec(t))) {
    let lit = t.slice(last, m.index);
    const role = roleOf(m, i++);
    if (role === 'q') lit = lit.replace(/ +$/, '');             // spaces around the quote are
    src += literal(lit);                                        // absorbed by [\s\S]+ / trim
    src += role === 'q' ? '(?<q>[\\s\\S]+)' : '(?<w>\\S+)';
    last = m.index + m[0].length;
    if (role === 'q') while (t[last] === ' ') last++;
  }
  let tail = t.slice(last);
  // A sentence-final period (fr, es removals, ar attachments) is accepted but not required.
  const period = tail.endsWith('.');
  if (period) tail = tail.slice(0, -1);
  src += literal(tail) + (period ? '\\.?' : '') + '$';
  return src;
}

function dedupe(entries) {
  // entries: [{ key, line, loc }] → one line per key with the locales joined
  const seen = new Map();
  for (const e of entries) {
    if (seen.has(e.key)) seen.get(e.key).locs.push(e.loc);
    else seen.set(e.key, { line: e.line, locs: [e.loc] });
  }
  return [...seen.values()].map(v => `    ${v.line}, // ${v.locs.join(',')}`);
}

// ---- Apple: quoted-text templates → regex entries ---------------------------
function appleText() {
  const entries = [];
  for (const [loc, kind, tb, obj, tpl] of APPLE) {
    if (obj !== 'text' || (kind !== 'add' && kind !== 'remove')) continue;
    const positional = /%\d\$@/.test(tpl);
    const src = templateToSource(tpl, /%(\d)?\$?@/, (m, i) => {
      if (tb !== 'emoji') return 'q';
      if (positional) return m[1] === '1' ? 'w' : 'q';
      return i === 0 ? 'w' : 'q';
    });
    const emoji = tb === 'emoji' ? '' : `, emoji: '${TAPBACK_EMOJI[tb]}'`;
    const line = `{ re: new RegExp(${js(src)}), kind: '${kind}'${emoji} }`;
    entries.push({ key: line, line, loc, src, kind, tb });
  }
  // Same wording, different meaning across locales: the first locale listed wins.
  const bySrc = new Map();
  for (const e of entries) {
    const prev = bySrc.get(e.src);
    if (prev && (prev.kind !== e.kind || prev.tb !== e.tb)) console.log(`collision: ${JSON.stringify(e.src)} is ${prev.kind}/${prev.tb} in ${prev.loc} (wins) and ${e.kind}/${e.tb} in ${e.loc}`);
    if (!prev) bySrc.set(e.src, e);
  }
  return dedupe(entries);
}

// ---- Apple: attachment strings → exact-match table ---------------------------
// Each (locale, kind, tapback) has 12 strings that differ only in the attachment
// noun phrase; store the common prefix/suffix per tapback and the noun list once.
function appleAttachments() {
  const byLoc = new Map();
  for (const [loc, kind, tb, obj, tpl] of APPLE) {
    if (!ATTACHMENT_OBJECTS.includes(obj)) continue;
    if (!byLoc.has(loc)) byLoc.set(loc, new Map());
    const k = kind + ':' + tb;
    if (!byLoc.get(loc).has(k)) byLoc.get(loc).set(k, new Map());
    byLoc.get(loc).get(k).set(obj, normalize(tpl));
  }
  const groups = new Map(); // nouns-json → { nouns, heads: [[prefix, suffix, emoji]], locs }
  for (const [loc, kinds] of byLoc) {
    const local = new Map();
    for (const [k, objs] of kinds) {
      const strs = ATTACHMENT_OBJECTS.map(o => objs.get(o));
      if (strs.some(s => s === undefined)) throw new Error(`incomplete attachment set ${loc} ${k}`);
      const pre = commonPrefix(strs);
      const suf = commonSuffix(strs.map(s => s.slice(pre.length)));
      const nouns = strs.map(s => s.slice(pre.length, s.length - suf.length));
      const tb = k.split(':')[1];
      const key = JSON.stringify(nouns);
      if (!local.has(key)) local.set(key, { nouns, heads: [] });
      local.get(key).heads.push([pre, suf, TAPBACK_EMOJI[tb]]);
    }
    for (const [key, g] of local) {
      const gkey = key + '|' + JSON.stringify(g.heads);
      if (groups.has(gkey)) groups.get(gkey).locs.push(loc);
      else groups.set(gkey, { nouns: g.nouns, heads: g.heads, locs: [loc] });
    }
  }
  const lines = [];
  for (const g of groups.values()) {
    const heads = g.heads.map(([p, s, e]) => `[${js(p)}, ${js(s)}, '${e}']`).join(', ');
    lines.push(`    [[${heads}],\n     [${g.nouns.map(js).join(', ')}]], // ${g.locs.join(',')}`);
  }
  return lines;
}
function commonPrefix(strs) {
  let p = strs[0];
  for (const s of strs) { let i = 0; while (i < p.length && i < s.length && p[i] === s[i]) i++; p = p.slice(0, i); }
  return p;
}
function commonSuffix(strs) {
  const rev = s => [...s].reverse().join('');
  return rev(commonPrefix(strs.map(rev)));
}

// ---- Apple: reply prefixes ---------------------------------------------------
function replyPrefixes() {
  const seen = new Map();
  for (const [loc, kind, , , tpl] of APPLE) {
    if (kind !== 'reply') continue;
    const n = normalize(tpl);
    if (seen.has(n)) seen.get(n).push(loc); else seen.set(n, [loc]);
  }
  return [...seen].map(([s, locs]) => `    ${js(s)}, // ${locs.join(',')}`);
}

// ---- Google Messages -----------------------------------------------------------
function googleMessages() {
  const text = [], attach = [];
  for (const [loc, kind, target, tpl] of GOOGLE) {
    const photomoji = kind.startsWith('photomoji');
    const src = templateToSource(tpl, /%(\d)\$s/, (m) => (photomoji || m[1] === '2') ? 'q' : 'w');
    const k = photomoji ? 'attachment' : target === 'text' ? kind : 'attachment';
    const line = `{ re: new RegExp(${js(src)}), kind: '${k}' }`;
    (k === 'attachment' ? attach : text).push({ key: line, line, loc });
  }
  return dedupe(text).concat(dedupe(attach));
}

// ---- write patterns.js ------------------------------------------------------
const appleTextLines = appleText();
const appleAttachLines = appleAttachments();
const replyLines = replyPrefixes();
const googleLines = googleMessages();
const out = `// Reaction Viewer for Google Voice — pattern tables. GENERATED by
// tools/gen-tables.mjs from test/apple-tapback-fallbacks.json and
// test/google-messages-fallbacks.json; do not edit by hand, run the generator.
// Loaded before content.js (manifest "js" order); content.js reads GV_PATTERNS.
// Entry shape: { re, kind: 'add' | 'remove' | 'attachment', emoji? }; named groups
// q = quoted original text, w = emoji. Quote marks are small classes so a
// straight-quote variant of a template parses too.
(function (root) {
  'use strict';

  // Apple Messages (iPhone senders): SMS fallback strings for the six tapbacks,
  // custom emoji (iOS 18) and their removals on a quoted text, 44 locales. Source:
  // IMSharedUtilities.framework/Versions/A/Resources/IMSharedUtilities.loctable
  // (framework 10.0 build 1000, macOS 26 SDK build 26A432), read 2026-10-30.
  // Fixed tapbacks carry their emoji; emoji templates capture it.
  const APPLE = [
${appleTextLines.join('\n')}
  ];

  // Apple: reactions to attachments ("Loved an image": 12 attachment kinds x 6
  // tapbacks x add/remove, same source). Exact strings, dim only. Each group is
  // [[prefix, suffix, emoji], ...] plus the noun phrases; content.js expands them.
  const APPLE_ATTACHMENT_GROUPS = [
${appleAttachLines.join('\n')}
  ];

  // Apple: the reply fallback line (loctable key REPLIED_BACKWARD_COMPATIBILITY).
  const REPLY_PREFIXES = [
${replyLines.join('\n')}
  ];

  // Google Messages (Android senders): add/remove a reaction to a text (w = emoji,
  // q = quoted text) and the attachment / photomoji variants, which only dim.
  // Source: com.google.android.apps.messaging build 20261022_03_RC00 string
  // resources, all 25 locale splits, extracted 2026-10-30. The templates'
  // invisible characters are removed by content.js normalize() before matching.
  const GOOGLE_MESSAGES = [
${googleLines.join('\n')}
  ];

  const tables = { APPLE: APPLE, APPLE_ATTACHMENT_GROUPS: APPLE_ATTACHMENT_GROUPS, REPLY_PREFIXES: REPLY_PREFIXES, GOOGLE_MESSAGES: GOOGLE_MESSAGES };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = tables; // node unit tests
    return;
  }
  root.GV_PATTERNS = tables;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
writeFileSync(join(ROOT, 'patterns.js'), out);
console.log(`patterns.js: apple text patterns ${appleTextLines.length}, apple attachment groups ${appleAttachLines.length}, reply prefixes ${replyLines.length}, google patterns ${googleLines.length}`);
