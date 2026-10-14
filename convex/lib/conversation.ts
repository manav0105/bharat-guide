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

// These are question words, not subject words. Subjects come only from user
// messages; previous AI answers cannot introduce a different service.
const subjectFiller = new Set('a an the how what which who where when why do does did is are am can could should would will i we you my me our your they them their it its this that these those for to of in on at with and or please need needs needed apply application applying get gives give money scheme schemes eligible eligibility long take takes documents required requirements'.split(' '));
export function isFollowUp(question: string): boolean {
  const words = question.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.length > 0 && words.every(word => subjectFiller.has(word));
}
export function earlierSubject(history: ChatTurn[]): string {
  for (const turn of [...history].reverse()) {
    if (isFollowUp(turn.question)) continue;
    const words = turn.question.match(/[a-z0-9]+/gi) || [];
    const subject = words.filter(word => !subjectFiller.has(word.toLowerCase())).slice(0, 8).join(' ');
    if (subject) return subject;
  }
  return '';
}
export function mentionsSubject(value: string, subject: string): boolean {
  const tokens = new Set((value.toLowerCase().match(/[a-z0-9]+/g) || []).map(word => word.length > 4 ? word.replace(/s$/, '') : word));
  const words = subject.toLowerCase().match(/[a-z0-9]+/g) || [];
  return words.length > 0 && words.every(word => tokens.has(word.length > 4 ? word.replace(/s$/, '') : word));
}
export function anchorQuery(query: string, subject: string): string {
  return !subject || mentionsSubject(query, subject) ? query : `${query} ${subject}`;
}
export function hasSubjectInTopFive(chunks: { title: string; text: string }[], subject: string): boolean {
  return chunks.slice(0, 5).some(chunk => mentionsSubject(`${chunk.title} ${chunk.text}`, subject));
}
