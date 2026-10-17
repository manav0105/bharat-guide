export const FREE_QUESTIONS = 3;

type GuestVisitor = { _id?: string; questions: number; guestQuestions?: number; guestQuestionsSinceGate?: number };

// The pre-launch visitor snapshot and the read-only audit identify one legacy
// row whose old daily count was copied into guestQuestions by the first release.
// Discount that historical question on read; leave the original row untouched.
const copiedPreGateQuestions: Readonly<Record<string, number>> = {
  j974d5nzvhb2b114dynadj4eqd8gb81z: 1,
};

export function guestQuestionsUsed(visitor: GuestVisitor): number {
  return visitor.guestQuestionsSinceGate
    ?? Math.max(0, (visitor.guestQuestions ?? 0) - (copiedPreGateQuestions[visitor._id ?? ''] ?? 0));
}

export function guestQuestionsRemaining(visitor: GuestVisitor): number {
  return Math.max(0, FREE_QUESTIONS - guestQuestionsUsed(visitor));
}
