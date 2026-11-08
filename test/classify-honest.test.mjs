// 2026-11-08 live call: a reason claimed the input lacked the material it stated ("cotton ... not specified").
// honestReason drops absence claims about details the input states, and keeps true ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { honestReason, wordsOf } from '../src/classify.js';

const ctx = (t) => new Set(wordsOf(t).map((w) => w.replace(/s$/, '')));
const cotton = ctx("men's 100% cotton knit t-shirt");

test('drops a false "material not specified" clause and keeps the rest', () => {
  assert.equal(
    honestReason('The product is a men’s t-shirt, but the material (cotton) is not specified in the description.', cotton),
    'The product is a men’s t-shirt.');
});
test('a reason made only of a false absence claim becomes the neutral line', () => {
  assert.match(honestReason('The material is not specified.', cotton), /Matches the wording of your input/);
});
test('true absence claims are kept', () => {
  assert.equal(honestReason('The description requires it to be all white, which is not provided.', cotton),
    'The description requires it to be all white, which is not provided.');
  assert.equal(honestReason('The material is not specified.', ctx('knit t-shirt')), 'The material is not specified.');
});
