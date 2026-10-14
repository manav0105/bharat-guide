import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { indiaDay } from "./lib/answerRules";

// Private gap log: no visitor ID, cookie, conversation history or AI response.
export const record = internalMutation({
  args: { question: v.string() },
  returns: v.id("unansweredQuestions"),
  handler: async (ctx, args) => {
    const question = args.question.trim();
    if (!question || question.length > 500) throw new Error("Invalid question length");
    const askedAt = Date.now();
    return await ctx.db.insert("unansweredQuestions", { question, date: indiaDay(askedAt), askedAt });
  },
});

// Administrator-only review, newest first; reads stay bounded and indexed.
export const recent = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("unansweredQuestions"), _creationTime: v.number(),
    question: v.string(), date: v.string(), askedAt: v.number(),
  })),
  handler: async (ctx) => await ctx.db.query("unansweredQuestions").withIndex("by_date").order("desc").take(100),
});
