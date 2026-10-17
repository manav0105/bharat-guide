export const FREE_QUESTIONS = 3;

// Old visitor rows remain valid. Their retained question count is the only
// available history; no backfill or rewrite of existing rows is needed.
export function guestQuestionsUsed(visitor: { questions: number; guestQuestions?: number }): number {
  return visitor.guestQuestions ?? visitor.questions;
}

export function guestQuestionsRemaining(visitor: { questions: number; guestQuestions?: number }): number {
  return Math.max(0, FREE_QUESTIONS - guestQuestionsUsed(visitor));
}
