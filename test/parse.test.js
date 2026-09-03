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
