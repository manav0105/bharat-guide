import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { parseHistory } from "./lib/conversation";
import { NOT_FOUND } from "./lib/answerRules";
import { stateNotFound } from "./lib/sourcePolicy";
import { ConvexError } from "convex/values";
import { auth } from "./auth";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";

const http = httpRouter();
auth.addHttpRoutes(http);
const cookieName = "bharat_visitor";
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json", "Cache-Control": "no-store", ...extra,
  } });

function readToken(request: Request): string | null {
  const token = request.headers.get("Cookie")?.split(";")
    .map((entry) => entry.trim()).find((entry) => entry.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

async function hash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

http.route({
  path: "/api/visitor", method: "GET",
  handler: httpAction(async (ctx, request) => {
    const oldToken = readToken(request);
    if (oldToken) {
      const visitor = await ctx.runMutation(internal.questions.visitor, {
        tokenHash: await hash(oldToken), create: false,
      });
      if (visitor) return json(visitor);
    }
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const visitor = await ctx.runMutation(internal.questions.visitor, { tokenHash: await hash(token), create: true });
    return json(visitor, 200, {
      "Set-Cookie": `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
    });
  }),
});

http.route({
  path: "/api/ask", method: "POST",
  handler: httpAction(async (ctx, request) => {
    // No CORS allowance. Browser access is same-origin via hosting/Vite proxy.
    if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) {
      return json({ error: "Send a question as JSON." }, 415);
    }
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 65536) return json({ error: "This question and its recent chat context are too long." }, 413);
    const token = readToken(request);
    if (!token) return json({ error: "Refresh the page to start your daily allowance." }, 401);
    let input: unknown;
    try {
      const body = await request.text();
      if (body.length > 20000) return json({ error: "This question and its recent chat context are too long." }, 413);
      input = JSON.parse(body);
    } catch {
      return json({ error: "Please enter a question." }, 400);
    }
    const question = input && typeof input === "object" && "question" in input ? input.question : null;
    if (typeof question !== "string" || !question.trim() || question.trim().length > 500) {
      return json({ error: "Enter a question between 1 and 500 characters." }, 400);
    }
    const history = parseHistory(input && typeof input === "object" && "history" in input ? input.history : undefined);
    if (!history) return json({ error: "Send at most three completed chat turns." }, 400);
    let result;
    let anonymousRemaining: number | undefined;
    try {
      const tokenHash = await hash(token);
      result = await ctx.runAction(internal.ai.answer, { question: question.trim(), history, tokenHash });
      // Read the same per-visitor counter used by the reservation transaction.
      // A failed allowance refresh must not discard an otherwise valid answer.
      try {
        const status = await ctx.runMutation(internal.questions.visitor, { tokenHash, create: false });
        anonymousRemaining = status?.anonymousRemaining;
      } catch { /* The browser refreshes /api/visitor if this value is absent. */ }
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null && "code" in error.data && error.data.code === "SIGNUP_REQUIRED") {
        return json({ error: "Sign up free to keep asking", code: "SIGNUP_REQUIRED", anonymousRemaining: 0 }, 403);
      }
      return json({ error: "Service busy, please try again in a minute" }, 503);
    }
    if (result.error === "limit") {
      return json({ error: "You have asked 20 questions today. Come back tomorrow.", remaining: 0, anonymousRemaining }, 429);
    }
    if (result.error === "configuration") {
      return json({ error: "Answers are not available yet. Please try again later." }, 503);
    }
    if (result.error === "unavailable") {
      return json({ error: "Service busy, please try again in a minute", remaining: result.remaining, anonymousRemaining, searchQuery: result.searchQuery, searchSources: result.searchSources, rewritePath: result.rewritePath }, 503);
    }
    if (result.answer === NOT_FOUND || result.answer === stateNotFound(result.searchQuery || question)) {
      try {
        await ctx.runMutation(internal.unansweredQuestions.record, { question: question.trim() });
      } catch {
        // A logging outage must not replace the citizen's answer or expose it
        // in server logs. No visitor identity or conversation is stored here.
        console.warn("Could not save unanswered-question log");
      }
    }
    return json({ answer: result.answer, sources: result.sources, remaining: result.remaining, anonymousRemaining, searchQuery: result.searchQuery, searchSources: result.searchSources, rewritePath: result.rewritePath });
  }),
});

registerStaticRoutes(http, components.staticHosting);
export default http;
