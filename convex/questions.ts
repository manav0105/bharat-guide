import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { DAILY_LIMIT, canAsk, indiaDay, usedToday, searchQuestion, usefulChunk, isGovernmentUrl } from "./lib/answerRules";

export const visitor = internalMutation({
  args: { tokenHash: v.string(), create: v.boolean() },
  returns: v.union(v.object({ remaining: v.number() }), v.null()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db.query("visitors")
      .withIndex("by_token", (q) => q.eq("tokenHash", args.tokenHash)).unique();
    if (existing) return { remaining: DAILY_LIMIT - usedToday(existing.day, existing.questions, now) };
    if (!args.create) return null;
    await ctx.db.insert("visitors", { tokenHash: args.tokenHash, day: indiaDay(now), questions: 0 });
    return { remaining: DAILY_LIMIT };
  },
});

// The count and allowance check share one transaction, including simultaneous
// requests from multiple tabs. The browser cannot supply or reset the count.
export const reserveQuestion = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.object({ allowed: v.boolean(), remaining: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const visitor = await ctx.db.query("visitors")
      .withIndex("by_token", (q) => q.eq("tokenHash", args.tokenHash)).unique();
    if (!visitor || !canAsk(visitor.day, visitor.questions, now)) {
      return { allowed: false, remaining: 0 };
    }
    const questions = usedToday(visitor.day, visitor.questions, now) + 1;
    await ctx.db.patch(visitor._id, { day: indiaDay(now), questions });
    return { allowed: true, remaining: DAILY_LIMIT - questions };
  },
});

export const search = internalQuery({
  args: { question: v.string() },
  returns: v.array(v.object({ id: v.string(), title: v.string(), text: v.string(), url: v.string() })),
  handler: async (ctx, args) => {
    const terms = searchQuestion(args.question);
    if (!terms) return [];
    // documents already contains one record per chunk (18,068), not one per
    // source document. Reuse its existing text index without rewriting data.
    const candidates = await ctx.db.query("documents")
      .withSearchIndex("search_text", (q) => q.search("text", terms)).take(64);
    return candidates
      .filter((chunk) => isGovernmentUrl(chunk.url) && usefulChunk(chunk.text, chunk.title))
      .slice(0, 8)
      .map((chunk) => ({ id: chunk._id, title: chunk.title, text: chunk.text, url: chunk.url }));
  },
});
