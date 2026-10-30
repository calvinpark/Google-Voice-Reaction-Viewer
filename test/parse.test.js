// node --test test/
// Unit tests for the pure functions in content.js (no DOM needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const gv = require('../content.js');

test('standard tapbacks', () => {
  assert.deepEqual(gv.parseReaction('Loved “See you at the park at 3, bring the frisbee”'),
    { kind: 'add', emoji: '❤️', quote: 'See you at the park at 3, bring the frisbee' });
  assert.deepEqual(gv.parseReaction('Liked "Gotcha. Thanks for looking"'),
    { kind: 'add', emoji: '👍', quote: 'Gotcha. Thanks for looking' });
  assert.equal(gv.parseReaction('Disliked “x”').emoji, '👎');
  assert.equal(gv.parseReaction('Laughed at “x”').emoji, '😂');
  assert.equal(gv.parseReaction('Emphasized “x”').emoji, '‼️');
  assert.equal(gv.parseReaction('Questioned “x”').emoji, '❓');
});

test('quotes inside the quote', () => {
  assert.equal(gv.parseReaction('Loved “he said “hi” to me”').quote, 'he said “hi” to me');
});

test('iOS 18 custom emoji', () => {
  assert.deepEqual(gv.parseReaction('Reacted 😂 to “Add gratuities”'), { kind: 'add', emoji: '😂', quote: 'Add gratuities' });
  assert.equal(gv.parseReaction('Reacted 👨‍👩‍👧 to “fam”').emoji, '👨‍👩‍👧');
  assert.equal(gv.parseReaction('Reacted 👍🏽 to “ok”').emoji, '👍🏽');
  assert.equal(gv.parseReaction('Reacted to “x”'), null);
  assert.equal(gv.parseReaction('Reacted badly to “x”'), null);
});

test('removals', () => {
  assert.deepEqual(gv.parseReaction('Removed a heart from “Nice!”'), { kind: 'remove', emoji: '❤️', quote: 'Nice!' });
  assert.equal(gv.parseReaction('Removed a like from “x”').emoji, '👍');
  assert.equal(gv.parseReaction('Removed a dislike from “x”').emoji, '👎');
  assert.equal(gv.parseReaction('Removed a laugh from “x”').emoji, '😂');
  assert.equal(gv.parseReaction('Removed an exclamation from “x”').emoji, '‼️');
  assert.equal(gv.parseReaction('Removed a question mark from “x”').emoji, '❓');
  assert.equal(gv.parseReaction('Removed 😂 from “x”').emoji, '😂');
  assert.equal(gv.parseReaction('Removed a banana from “x”'), null);
});

test('attachment reactions have no quote', () => {
  assert.deepEqual(gv.parseReaction('Loved an image'), { kind: 'attachment', emoji: '❤️', quote: null });
  assert.equal(gv.parseReaction('Liked an attachment').kind, 'attachment');
  assert.equal(gv.parseReaction('Liked a lot'), null);
});

test('ordinary messages are not reactions', () => {
  assert.equal(gv.parseReaction('I Loved “that” movie'), null);
  assert.equal(gv.parseReaction('Loved it'), null);
  assert.equal(gv.parseReaction(''), null);
});

test('textsEqual: exact, emoji-insensitive, ellipsis prefix', () => {
  assert.ok(gv.textsEqual('Thanks', 'Thanks'));
  assert.ok(gv.textsEqual('Thanks 🙏🙏', 'Thanks'));
  assert.ok(gv.textsEqual('Thanks', 'Thanks 🙏'));
  assert.ok(gv.textsEqual('Aqua Trike rentals can be…', 'Aqua Trike rentals can be reserved in advance'));
  assert.ok(!gv.textsEqual('short…', 'short message here'));
  assert.ok(!gv.textsEqual('lol', 'lol ok'));
  assert.ok(!gv.textsEqual('🙏', '🙏'.repeat(0) + ''));
});

test('normalize collapses whitespace and nbsp', () => {
  assert.equal(gv.normalize('  a   b\n c '), 'a b c');
});

test('localized: the three real rows from Calvin\u2019s threads (2026-10-29 screenshots)', () => {
  assert.deepEqual(gv.parseReaction('Le hace gracia \u201cCool. I mean I don\u0027t want to carb load one more day hehe\u201d'),
    { kind: 'add', emoji: '\ud83d\ude02', quote: 'Cool. I mean I don\u0027t want to carb load one more day hehe' });
  assert.deepEqual(gv.parseReaction('\u201c\ub124 \uc774\ub530 \ubd59\uaca0\uc2b5\ub2c8\ub2e4\u201d \uba54\uc2dc\uc9c0\uc5d0 \ud83d\udc4d \ubc18\uc751 \ubcf4\ub0c4'),
    { kind: 'add', emoji: '\ud83d\udc4d', quote: '\ub124 \uc774\ub530 \ubd59\uaca0\uc2b5\ub2c8\ub2e4' });
  assert.deepEqual(gv.parseReaction('\u201clong hanja message\u201d\u306b\u300c\u3044\u3044\u306d\u300d\u3068\u5fdc\u7b54'),
    { kind: 'add', emoji: '\ud83d\udc4d', quote: 'long hanja message' });
});

// Apple's own strings (IMSharedUtilities.loctable, macOS 26, read 2026-10-30) for the
// languages Calvin's contacts use, filled the way an iPhone fills them.
test('apple strings: spanish, Spain and Latin America', () => {
  assert.equal(gv.parseReaction('Le gusta “hola”').emoji, '👍');          // es like
  assert.equal(gv.parseReaction('Le gustó “hola”').emoji, '👍');      // es_419 like
  assert.equal(gv.parseReaction('Le encanta “hola”').emoji, '❤️');
  assert.equal(gv.parseReaction('Le encantó “hola”').emoji, '❤️');
  assert.equal(gv.parseReaction('Le dio risa “hola”').emoji, '😂');
  assert.equal(gv.parseReaction('Le sorprende “hola”').emoji, '‼️');
  assert.equal(gv.parseReaction('Exclamó por “hola”').emoji, '‼️');
  assert.equal(gv.parseReaction('Duda sobre “hola”').emoji, '❓');
  assert.equal(gv.parseReaction('No le gusta “eso”').emoji, '👎');
  assert.deepEqual(gv.parseReaction('Se ha reaccionado con 🔥 a “hola”'), { kind: 'add', emoji: '🔥', quote: 'hola' });
  assert.deepEqual(gv.parseReaction('Reaccionó con 🔥 a “hola”'), { kind: 'add', emoji: '🔥', quote: 'hola' });
  assert.deepEqual(gv.parseReaction('Ya no le gusta “hola”'), { kind: 'remove', emoji: '👍', quote: 'hola' });
  assert.deepEqual(gv.parseReaction('Dejó de encantarle “hola”'), { kind: 'remove', emoji: '❤️', quote: 'hola' });
  assert.deepEqual(gv.parseReaction('Ha eliminado 🔥 de “hola”.'), { kind: 'remove', emoji: '🔥', quote: 'hola' });
});

test('apple strings: korean, japanese, chinese', () => {
  // Korean: single curly quotes, verb last
  assert.deepEqual(gv.parseReaction('‘안녕’에 좋아요 표시함'), { kind: 'add', emoji: '👍', quote: '안녕' });
  assert.equal(gv.parseReaction('‘안녕’에 하트 표시함').emoji, '❤️');
  assert.deepEqual(gv.parseReaction('‘안녕’에 🔥 표시로 반응함'), { kind: 'add', emoji: '🔥', quote: '안녕' });
  assert.deepEqual(gv.parseReaction('‘안녕’에서 웃음 표시 제거함'), { kind: 'remove', emoji: '😂', quote: '안녕' });
  // Japanese: fixed words in 「」, emoji without brackets
  assert.equal(gv.parseReaction('“こんにちは”に「ハート」と応答').emoji, '❤️');
  assert.equal(gv.parseReaction('“こんにちは”に「笑」と応答').emoji, '😂');
  assert.equal(gv.parseReaction('“こんにちは”に「!!」と応答').emoji, '‼️');
  assert.equal(gv.parseReaction('“こんにちは”に「?」と応答').emoji, '❓');
  assert.deepEqual(gv.parseReaction('“こんにちは”に🔥でリアクションしました'), { kind: 'add', emoji: '🔥', quote: 'こんにちは' });
  assert.deepEqual(gv.parseReaction('“こんにちは”から「いいね」を削除'), { kind: 'remove', emoji: '👍', quote: 'こんにちは' });
  // Chinese: Simplified uses a colon and no quotes; Traditional uses 「」
  assert.deepEqual(gv.parseReaction('赞了：你好'), { kind: 'add', emoji: '👍', quote: '你好' });
  assert.equal(gv.parseReaction('比心：你好').emoji, '❤️');
  assert.deepEqual(gv.parseReaction('用🔥回应了“你好”'), { kind: 'add', emoji: '🔥', quote: '你好' });
  assert.deepEqual(gv.parseReaction('收回了赞：你好'), { kind: 'remove', emoji: '👍', quote: '你好' });
  assert.deepEqual(gv.parseReaction('喜歡「你好」'), { kind: 'add', emoji: '👍', quote: '你好' });     // zh_TW like
  assert.deepEqual(gv.parseReaction('已用🔥回應「你好」'), { kind: 'add', emoji: '🔥', quote: '你好' });
});

test('apple strings: french, german, italian, portuguese', () => {
  assert.deepEqual(gv.parseReaction(gv.normalize('A adoré « Bonjour ».')), { kind: 'add', emoji: '❤️', quote: 'Bonjour' });
  assert.equal(gv.parseReaction(gv.normalize('A adoré « Bonjour »')).emoji, '❤️'); // period optional
  assert.equal(gv.parseReaction(gv.normalize('N’a pas aimé « Bonjour ».')).emoji, '👎');
  assert.deepEqual(gv.parseReaction(gv.normalize('A ajouté 🔥 à « Bonjour ».')), { kind: 'add', emoji: '🔥', quote: 'Bonjour' });
  assert.deepEqual(gv.parseReaction(gv.normalize('A retiré son « J’aime » de « Bonjour ».')), { kind: 'remove', emoji: '👍', quote: 'Bonjour' });
  assert.deepEqual(gv.parseReaction('Jemandem gefällt „Hallo“'), { kind: 'add', emoji: '👍', quote: 'Hallo' });
  assert.equal(gv.parseReaction('Jemandem gefällt „Hallo“ nicht').emoji, '👎');
  assert.equal(gv.parseReaction('Hat auf „Hallo“ mit einem Herz reagiert').emoji, '❤️');
  assert.deepEqual(gv.parseReaction('Hat mit 🔥 auf „Hallo“ reagiert'), { kind: 'add', emoji: '🔥', quote: 'Hallo' });
  assert.deepEqual(gv.parseReaction('„Gefällt mir“ von „Hallo“ entfernt'), { kind: 'remove', emoji: '👍', quote: 'Hallo' });
  assert.equal(gv.parseReaction('Ha aggiunto “Mi piace” a “ciao”').emoji, '👍');
  assert.equal(gv.parseReaction('Trova divertente “ciao”').emoji, '😂');
  assert.deepEqual(gv.parseReaction('Ha reagito con 🔥 a “ciao”'), { kind: 'add', emoji: '🔥', quote: 'ciao' });
  assert.equal(gv.parseReaction('Curtiu “oi”').emoji, '👍');                 // pt_BR
  assert.equal(gv.parseReaction('Adorou “oi”').emoji, '❤️');                  // pt_PT
  assert.deepEqual(gv.parseReaction('Reagiu com 🔥 a “oi”'), { kind: 'add', emoji: '🔥', quote: 'oi' });
  assert.deepEqual(gv.parseReaction('Reagiu com “🔥” a “oi”'), { kind: 'add', emoji: '🔥', quote: 'oi' }); // pt_PT quotes the emoji
  // Same words, different meaning: "Gostou de" is love in Brazil and like in Portugal;
  // Brazilian Portuguese is listed first and wins.
  assert.equal(gv.parseReaction('Gostou de “oi”').emoji, '❤️');
});

test('apple strings: attachments are exact strings, dim only', () => {
  assert.deepEqual(gv.parseReaction('Hat auf ein Bild mit einem Herz reagiert'), { kind: 'attachment', emoji: '❤️', quote: null });
  assert.deepEqual(gv.parseReaction('이미지에 좋아요 표시함'), { kind: 'attachment', emoji: '👍', quote: null });
  assert.equal(gv.parseReaction(gv.normalize('A aimé une image.')).kind, 'attachment');
  assert.equal(gv.parseReaction(gv.normalize('A aimé une image')).kind, 'attachment');
  assert.equal(gv.parseReaction('Hat auf ein Bild mit einem Herz reagiert!'), null);
});

test('apple strings: localized reply prefixes are stripped', () => {
  const wrapped = gv.normalize('Antwort auf Nachricht:\nJemandem gefällt „Hallo“');
  assert.deepEqual(gv.parseReaction(wrapped), { kind: 'add', emoji: '👍', quote: 'Hallo' });
  assert.deepEqual(gv.parseReaction(gv.normalize('메시지에 답장을 보냄:\n‘안녕’에 좋아요 표시함')),
    { kind: 'add', emoji: '👍', quote: '안녕' });
  assert.ok(gv.textsEqual('Hallo', gv.normalize('Antwort auf Nachricht:\nHallo')));
  assert.equal(gv.parseReaction(gv.normalize('Antwort auf Nachricht:\nbis gleich')), null);
});

test('localized: ordinary foreign sentences stay untouched', () => {
  assert.equal(gv.parseReaction('Le hace gracia que vengas'), null);
  assert.equal(gv.parseReaction('\uba54\uc2dc\uc9c0\uc5d0 \ubc18\uc751 \ubcf4\ub0c4'), null);
  assert.equal(gv.parseReaction('\u201cquoted\u201d\u306b\u300c\u672a\u77e5\u306e\u8a9e\u300d\u3068\u5fdc\u7b54'), null);
  assert.equal(gv.parseReaction('Reaccion\u00f3 con fuerza a \u201ceso\u201d'), null);
});

test('live 2026-10-30: zero-width and hair-space characters as Google Voice renders them', () => {
  // exact sequences read from the live DOM (U+200A inside quotes, U+200B around inline emoji)
  const ko = '\u201c\u200a\ub124 \uc774\ub530 \ubd59\uaca0\uc2b5\ub2c8\ub2e4\u200a\u201d \uba54\uc2dc\uc9c0\uc5d0 \u200b\ud83d\udc4d\u200b \ubc18\uc751 \ubcf4\ub0c4';
  assert.deepEqual(gv.parseReaction(gv.normalize(ko)),
    { kind: 'add', emoji: '\ud83d\udc4d', quote: '\ub124 \uc774\ub530 \ubd59\uaca0\uc2b5\ub2c8\ub2e4' });
  const goog = '\u200b\ud83d\ude02\u200b to \u201c\u200aNVDA is crashing down so I gotta get this booked soon haha\u200a\u201d';
  assert.deepEqual(gv.parseReaction(gv.normalize(goog)),
    { kind: 'add', emoji: '\ud83d\ude02', quote: 'NVDA is crashing down so I gotta get this booked soon haha' });
  const en18 = 'Reacted \u200b\ud83d\ude02\u200b to \u201c\u200ahello\u200a\u201d';
  assert.equal(gv.parseReaction(gv.normalize(en18)).emoji, '\ud83d\ude02');
});

test('live 2026-10-30: reply-wrapped rows', () => {
  const wrapped = gv.normalize('Replied to a message:\nEmphasized \u201c\ud83e\udd23 \ud83e\udd23 \ud83e\udd23 \ud83e\udd23\u201d');
  assert.deepEqual(gv.parseReaction(wrapped),
    { kind: 'add', emoji: '\u203c\ufe0f', quote: '\ud83e\udd23 \ud83e\udd23 \ud83e\udd23 \ud83e\udd23' });
  // a plain reply, and a bare-emoji reply, are ordinary messages
  assert.equal(gv.parseReaction(gv.normalize('Replied to a message:\nsounds good, see you there')), null);
  assert.equal(gv.parseReaction(gv.normalize('Replied to a message:\n\ud83e\udd23\ud83e\udd23\ud83e\udd23')), null);
  // the quote can match the reply row it points at, minus the prefix
  assert.ok(gv.textsEqual('\ud83e\udd23 \ud83e\udd23', gv.normalize('Replied to a message:\n\ud83e\udd23 \ud83e\udd23')));
  // an ordinary sentence containing " to " stays untouched
  assert.equal(gv.parseReaction('Go to \u201cSettings\u201d and turn it off'), null);
});

// Decorate a row the way Google Voice renders it live (2026-10-30): emoji wrapped in
// U+200B, curly quotes padded with U+200A, and a stray direction mark up front.
const E = /\p{Extended_Pictographic}(?:️)?/gu;
function live(s) {
  return '‎' + s.replace(E, m => '​' + m + '​')
                     .replace(/“/g, '“ ').replace(/”/g, ' ”')
                     .replace(/«/g, '« ').replace(/»/g, ' »');
}
const cases = [
  // [row, expected emoji, expected quote]
  ['Loved “hola”', '❤️', 'hola'],
  ['Reacted 🔥 to “hola”', '🔥', 'hola'],
  ['Removed 🔥 from “hola”', '🔥', 'hola'],
  ['Le hace gracia “hola”', '😂', 'hola'],
  ['Le gustó “hola”', '👍', 'hola'],
  ['Reaccionó con 🔥 a “hola”', '🔥', 'hola'],
  ['“안녕” 메시지에 👍 반응 보냄', '👍', '안녕'],
  ['“안녕” 메시지에 🔥 반응 보냄', '🔥', '안녕'],
  ['‘안녕’에 좋아요 표시함', '👍', '안녕'],
  ['‘안녕’에 🔥 표시로 반응함', '🔥', '안녕'],
  ['“こんにちは”に「いいね」と応答', '👍', 'こんにちは'],
  ['“こんにちは”に🔥でリアクションしました', '🔥', 'こんにちは'],
  ['A adoré « Bonjour ».', '❤️', 'Bonjour'],
  ['A ajouté 🔥 à « Bonjour ».', '🔥', 'Bonjour'],
  ['Hat auf „Hallo“ mit einem Herz reagiert', '❤️', 'Hallo'],
  ['Hat mit 🔥 auf „Hallo“ reagiert', '🔥', 'Hallo'],
  ['Trova divertente “ciao”', '😂', 'ciao'],
  ['Ha reagito con 🔥 a “ciao”', '🔥', 'ciao'],
  ['Curtiu “oi”', '👍', 'oi'],
  ['Reagiu com 🔥 a “oi”', '🔥', 'oi'],
  ['赞了：你好', '👍', '你好'],
  ['用🔥回应了“你好”', '🔥', '你好'],
  ['😂 to “hello”', '😂', 'hello'],
  ['Replied to a message: Emphasized “🤣 🤣”', '‼️', '🤣 🤣'],
];
for (const [row, emoji, quote] of cases) {
  test('live decoration: ' + row, () => {
    const r = gv.parseReaction(gv.normalize(live(row)));
    assert.ok(r, 'no parse');
    assert.equal(r.emoji, emoji);
    assert.equal(r.quote, quote);
  });
}

// Every Apple fallback string (44 locales, straight from IMSharedUtilities.loctable)
// parses once its placeholders are filled the way an iPhone fills them: the quoted
// text in the %@ slot, the emoji (🔥 here) in the emoji slot (%1$@ or the first %@).
const APPLE_TEMPLATES = require('./apple-tapback-fallbacks.json');
const TAPBACK = { like: '👍', love: '❤️', dislike: '👎', laugh: '😂', emphasize: '‼️', question: '❓', emoji: '🔥' };
function fillApple(tpl, tb) {
  if (tb !== 'emoji') return tpl.replace('%@', 'hola mundo');
  if (/%\d\$@/.test(tpl)) return tpl.replace('%1$@', '🔥').replace('%2$@', 'hola mundo');
  return tpl.replace('%@', '🔥').replace('%@', 'hola mundo');
}
test('apple strings: all ' + APPLE_TEMPLATES.length + ' rows behave as labelled', () => {
  let add = 0, remove = 0, attach = 0, reply = 0, skipped = 0;
  const ATTACH = ['image', 'movie', 'attachment', 'location', 'contact', 'audio', 'event',
    'walletpass', 'walletorder', 'photomessage', 'handwritten', 'digitaltouch'];
  const collisions = new Set(['pt_PT add like text']); // "Gostou de": Brazil (love) wins
  for (const [loc, kind, tb, obj, tpl] of APPLE_TEMPLATES) {
    const label = `${loc} ${kind} ${tb} ${obj}`;
    if (kind === 'reply') {
      const r = gv.parseReaction(gv.normalize(tpl + '\nLiked “hola mundo”'));
      assert.deepEqual(r, { kind: 'add', emoji: '👍', quote: 'hola mundo' }, label);
      assert.ok(gv.textsEqual('hola mundo', gv.normalize(tpl + '\nhola mundo')), label);
      reply++; continue;
    }
    if (kind !== 'add' && kind !== 'remove') { skipped++; continue; }      // edited-message strings
    if (obj === 'unquoted' || obj === 'count') { skipped++; continue; }     // not parsed, see CLAUDE.md
    const r = gv.parseReaction(gv.normalize(fillApple(tpl, tb)));
    assert.ok(r, `${label}: no parse for ${JSON.stringify(tpl)}`);
    if (ATTACH.includes(obj)) {
      assert.equal(r.kind, 'attachment', label); assert.equal(r.quote, null, label); attach++;
    } else if (collisions.has(label)) {
      skipped++;
    } else {
      assert.deepEqual(r, { kind, emoji: TAPBACK[tb], quote: 'hola mundo' }, label);
      if (kind === 'add') add++; else remove++;
    }
  }
  assert.equal(add, 44 * 7 - 1); assert.equal(remove, 44 * 7); assert.equal(attach, 44 * 144); assert.equal(reply, 44);
  assert.equal(skipped, 44 * (12 + 12 + 2) + 1);
});

// Every Google Messages fallback template (all 25 locale splits, straight from the
// app's string resources) parses once its placeholders are filled the way the app
// fills them: %1$s = the emoji wrapped in U+200B/U+200C, %2$s = the quoted text
// padded with U+200A.
const GOOGLE_TEMPLATES = require('./google-messages-fallbacks.json');
test('google messages: all ' + GOOGLE_TEMPLATES.length + ' templates parse', () => {
  let add = 0, remove = 0, attach = 0;
  for (const [loc, kind, target, tpl] of GOOGLE_TEMPLATES) {
    const emojiWrap = kind === 'remove' ? '‌👍‌' : '​👍​';
    const filled = kind.startsWith('photomoji')
      ? tpl.replace('%1$s', ' hola mundo ')
      : tpl.replace('%1$s', emojiWrap).replace('%2$s', ' hola mundo ');
    const r = gv.parseReaction(gv.normalize(filled));
    assert.ok(r, `${loc} ${kind}/${target}: no parse for ${JSON.stringify(tpl)}`);
    if (kind === 'add' && target === 'text') {
      assert.deepEqual(r, { kind: 'add', emoji: '👍', quote: 'hola mundo' }, `${loc} add/text`); add++;
    } else if (kind === 'remove' && target === 'text') {
      assert.deepEqual(r, { kind: 'remove', emoji: '👍', quote: 'hola mundo' }, `${loc} remove/text`); remove++;
    } else {
      assert.equal(r.kind, 'attachment', `${loc} ${kind}/${target}`); attach++;
    }
  }
  assert.equal(add, 25); assert.equal(remove, 25); assert.equal(attach, GOOGLE_TEMPLATES.length - 50);
});

test('google messages: the live Korean salon row is Google wording, parses', () => {
  const r = gv.parseReaction(gv.normalize('“ 네 이따 뵙겠습니다 ” 메시지에 ​👍​ 반응 보냄'));
  assert.deepEqual(r, { kind: 'add', emoji: '👍', quote: '네 이따 뵙겠습니다' });
  const rm = gv.parseReaction(gv.normalize('“ 네 이따 뵙겠습니다 ” 메시지에서 ‌👍‌ 반응 삭제함'));
  assert.deepEqual(rm, { kind: 'remove', emoji: '👍', quote: '네 이따 뵙겠습니다' });
});
