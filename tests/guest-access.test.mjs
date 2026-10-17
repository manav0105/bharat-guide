import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FREE_QUESTIONS, guestQuestionsUsed, guestQuestionsRemaining } from '../convex/lib/guestAccess.ts';

test('three guest questions, fourth requires an account, including across daily resets', () => {
  assert.equal(FREE_QUESTIONS, 3);
  assert.equal(guestQuestionsRemaining({ questions: 0 }), 3);
  assert.equal(guestQuestionsRemaining({ questions: 2, guestQuestions: 2 }), 1);
  assert.equal(guestQuestionsRemaining({ questions: 3, guestQuestions: 3 }), 0);
  assert.equal(guestQuestionsRemaining({ questions: 0, guestQuestions: 3 }), 0);
});

test('questions from before the gate never consume a guest allowance', () => {
  assert.equal(guestQuestionsUsed({ questions: 2 }), 0);
  assert.equal(guestQuestionsRemaining({ questions: 2 }), 3);
  assert.equal(guestQuestionsRemaining({ questions: 20 }), 3);
});

test('the verified legacy counter excludes its copied pre-gate question without rewriting data', () => {
  const visitor = { _id: 'j974d5nzvhb2b114dynadj4eqd8gb81z', questions: 2, guestQuestions: 3 };
  const before = structuredClone(visitor);
  assert.equal(guestQuestionsUsed(visitor), 2);
  assert.equal(guestQuestionsRemaining(visitor), 1);
  assert.deepEqual(visitor, before);
});

test('a corrected counter takes precedence and survives a daily reset', () => {
  assert.equal(guestQuestionsRemaining({ questions: 0, guestQuestions: 20, guestQuestionsSinceGate: 2 }), 1);
  assert.equal(guestQuestionsRemaining({ questions: 0, guestQuestionsSinceGate: 3 }), 0);
});
