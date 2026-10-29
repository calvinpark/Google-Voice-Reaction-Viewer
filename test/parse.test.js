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

test('localized: spanish variants', () => {
  assert.equal(gv.parseReaction('A Jamie le gust\u00f3 \u201cOn my way!\u201d').emoji, '\ud83d\udc4d');
  assert.equal(gv.parseReaction('Le encanta \u201chola\u201d').emoji, '\u2764\ufe0f');
  assert.equal(gv.parseReaction('Reaccion\u00f3 con \ud83d\udd25 a \u201chola\u201d').emoji, '\ud83d\udd25');
  assert.equal(gv.parseReaction('No le gusta \u201ceso\u201d').emoji, '\ud83d\udc4e');
});

test('localized: japanese word map and french', () => {
  assert.equal(gv.parseReaction('\u201c\u3053\u3093\u306b\u3061\u306f\u201d\u306b\u300c\u30cf\u30fc\u30c8\u300d\u3068\u5fdc\u7b54').emoji, '\u2764\ufe0f');
  assert.equal(gv.parseReaction('\u201c\u3053\u3093\u306b\u3061\u306f\u201d\u306b\u300c\u7b11\u300d\u3068\u5fdc\u7b54').emoji, '\ud83d\ude02');
  assert.equal(gv.parseReaction('A ador\u00e9 \u201cBonjour\u201d').emoji, '\u2764\ufe0f');
});

test('localized: ordinary foreign sentences stay untouched', () => {
  assert.equal(gv.parseReaction('Le hace gracia que vengas'), null);
  assert.equal(gv.parseReaction('\uba54\uc2dc\uc9c0\uc5d0 \ubc18\uc751 \ubcf4\ub0c4'), null);
  assert.equal(gv.parseReaction('\u201cquoted\u201d\u306b\u300c\u672a\u77e5\u306e\u8a9e\u300d\u3068\u5fdc\u7b54'), null);
  assert.equal(gv.parseReaction('Reaccion\u00f3 con fuerza a \u201ceso\u201d'), null);
});
