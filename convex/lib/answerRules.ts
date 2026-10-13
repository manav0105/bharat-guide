export const NOT_FOUND = "I could not find this in official sources";
export const DAILY_LIMIT = 20;

export function indiaDay(now: number): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

export function usedToday(day: string, questions: number, now: number): number {
  return day === indiaDay(now) ? questions : 0;
}

export function canAsk(day: string, questions: number, now: number): boolean {
  return usedToday(day, questions, now) < DAILY_LIMIT;
}

const stopWords = new Set(
  "a an the which what how is are can i me my to for of in on and or do does give gives get tell about please this that with money scheme schemes government".split(" "),
);

export function searchQuestion(question: string): string {
  const words = (question.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length > 1 && word.length <= 32);
  const meaningful = words.filter((word) => !stopWords.has(word));
  return [...new Set(meaningful.length ? meaningful : words)].slice(0, 16).join(" ");
}

export function isGovernmentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(?:^|\.)(?:gov|nic)\.in$/.test(url.hostname);
  } catch {
    return false;
  }
}

const menuLine = /^(?:home|main menu|menu|search|contact us|about us|contact|feedback|sitemap|site map|privacy policy|terms(?: and conditions)?|accessibility|screen reader access|skip to(?: main)? content|back to top|share(?: on.*)?|print|login|sign in|register|facebook|twitter|linkedin|youtube|instagram|a\+|a-|a|english|हिन्दी|हिंदी|copyright.*|all rights reserved.*)$/i;
const contactLine = /(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|^(?:tel(?:ephone)?|phone|fax|email|e-mail|address|helpline|contact number)\s*[:+])/i;

export function usefulChunk(text: string, title: string): boolean {
  const lines = text.split(/\n+/).map((line) => line.trim())
    .filter((line) => line && !menuLine.test(line) && !contactLine.test(line));
  const body = lines.join(" ");
  if (body.length < 70) return false;
  const substantive = lines.some((line) => {
    const words = line.match(/[a-z]{2,}/gi) ?? [];
    return words.length >= 12 && (
      /[.!?]/.test(line)
      || /\b(?:eligible|eligibility|benefit|provides?|assistance|insurance|coverage|grant|subsidy|scholarship|pension|loan|income|farmers|students|application|apply|annual|per annum)\b/i.test(line)
    );
  });
  // A contact page can contain long directory prose; it isn't scheme evidence.
  if (/\b(?:contact us|contact details|directory|sitemap)\b/i.test(title)
    && !/\b(?:eligible|eligibility|subsidy|scholarship|per annum|financial assistance)\b/i.test(body)) {
    return false;
  }
  return substantive;
}

export type Chunk = { id: string; title: string; text: string; url: string };
export type Answer = { answer: string; sources: { title: string; url: string }[] };

const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, " ").trim();

// Fixed wording changes preserve the source facts even when the model copies
// bureaucratic wording. No facts, amounts, conditions or URLs are added here.
export function simpleEnglish(text: string): string {
  return text
    .replace(/\s+which comes to a staggering [^.]+(?=\.)/gi, "")
    .replace(/\bsecondary and tertiary care hospitali[sz]ations?\b/gi, "hospital treatment")
    .replace(/\bsecondary and tertiary care\b/gi, "hospital treatment")
    .replace(/\ba health cover\b/gi, "health insurance")
    .replace(/\bempanelled\b/gi, "approved")
    .replace(/\bfinancial assistance\b/gi, "financial help")
    .replace(/\bper annum\b/gi, "each year")
    .replace(/\bunderprivileged population\b/gi, "people with low incomes")
    .replace(/\bcatastrophic out-of-pocket health expenditure\b/gi, "large hospital bills people pay themselves")
    .replace(/[ \t]{2,}/g, " ").trim();
}

// Never accept model-generated URLs. Each statement must supply an exact
// supporting quotation from a retrieved chunk. Reject malformed or unsupported
// statements individually, so one bad quotation cannot erase other supported
// information. Only fully validated statements and their sources are displayed.
export function groundedAnswer(raw: unknown, chunks: Chunk[]): Answer {
  const missing = { answer: NOT_FOUND, sources: [] };
  if (!raw || typeof raw !== "object") return missing;
  const result = raw as { found?: unknown; statements?: unknown };
  if (result.found !== true || !Array.isArray(result.statements)
    || !result.statements.length || result.statements.length > 5) return missing;
  const sources = new Map<string, { title: string; url: string }>();
  const paragraphs: string[] = [];
  for (const value of result.statements) {
    if (!value || typeof value !== "object") continue;
    const statement = value as { text?: unknown; evidence?: unknown };
    if (typeof statement.text !== "string" || !statement.text.trim()
      || !Array.isArray(statement.evidence) || !statement.evidence.length
      || statement.evidence.length > 8) continue;
    const text = simpleEnglish(statement.text.trim());
    if (/https?:\/\/|www\./i.test(text)) continue;
    const statementSources = new Map<string, { title: string; url: string }>();
    let valid = true;
    for (const entry of statement.evidence) {
      if (!entry || typeof entry !== "object") { valid = false; break; }
      const evidence = entry as { chunkId?: unknown; quote?: unknown };
      const chunk = chunks.find((item) => item.id === evidence.chunkId);
      if (!chunk || !isGovernmentUrl(chunk.url) || typeof evidence.quote !== "string"
        || normalize(evidence.quote).length < 20
        || !normalize(chunk.text).includes(normalize(evidence.quote))) { valid = false; break; }
      statementSources.set(chunk.url, { title: chunk.title, url: chunk.url });
    }
    if (!valid || [...paragraphs, text].join(" ").split(/\s+/).length > 200) continue;
    paragraphs.push(text);
    for (const [url, source] of statementSources) sources.set(url, source);
  }
  if (!paragraphs.length) return missing;
  const answer = paragraphs.join("\n\n");
  return { answer, sources: [...sources.values()] };
}
