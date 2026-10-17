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

test('legacy visitor rows need no migration and retain their allowance history', () => {
  assert.equal(guestQuestionsUsed({ questions: 2 }), 2);
  assert.equal(guestQuestionsRemaining({ questions: 2 }), 1);
  assert.equal(guestQuestionsRemaining({ questions: 20 }), 0);
});
