export type ChatTurn = { question: string; answer: string };

// Request-only context; no database function persists these turns.
export function parseHistory(value: unknown): ChatTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3) return null;
  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const turn = item as { question?: unknown; answer?: unknown };
    if (typeof turn.question !== "string" || !turn.question.trim() || turn.question.length > 500
      || typeof turn.answer !== "string" || !turn.answer.trim() || turn.answer.length > 4000) return null;
    turns.push({ question: turn.question, answer: turn.answer });
  }
  return turns;
}
