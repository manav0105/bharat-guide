import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();
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
  path: "/visitor", method: "GET",
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
  path: "/ask", method: "POST",
  handler: httpAction(async (ctx, request) => {
    // No CORS allowance. Browser access is same-origin via hosting/Vite proxy.
    if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) {
      return json({ error: "Send a question as JSON." }, 415);
    }
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 4096) return json({ error: "Keep your question under 500 characters." }, 413);
    const token = readToken(request);
    if (!token) return json({ error: "Refresh the page to start your daily allowance." }, 401);
    let input: unknown;
    try {
      const body = await request.text();
      if (body.length > 4096) return json({ error: "Keep your question under 500 characters." }, 413);
      input = JSON.parse(body);
    } catch {
      return json({ error: "Please enter a question." }, 400);
    }
    const question = input && typeof input === "object" && "question" in input ? input.question : null;
    if (typeof question !== "string" || !question.trim() || question.trim().length > 500) {
      return json({ error: "Enter a question between 1 and 500 characters." }, 400);
    }
    let result;
    try {
      result = await ctx.runAction(internal.ai.answer, { question: question.trim(), tokenHash: await hash(token) });
    } catch {
      return json({ error: "The answer service is busy. Please try again in a moment." }, 503);
    }
    if (result.error === "limit") {
      return json({ error: "You have asked 20 questions today. Come back tomorrow.", remaining: 0 }, 429);
    }
    if (result.error === "configuration") {
      return json({ error: "Answers are not available yet. Please try again later." }, 503);
    }
    if (result.error === "unavailable") {
      return json({ error: "The answer service is busy. Please try again in a moment.", remaining: result.remaining }, 503);
    }
    return json({ answer: result.answer, sources: result.sources, remaining: result.remaining });
  }),
});

export default http;
