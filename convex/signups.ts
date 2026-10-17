import { query } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";

// Aggregate counts only: never return users, emails, or account/session data.
// Pagination keeps the query bounded as the number of recorded days grows.
export const count = query({
  args: { paginationOpts: v.optional(paginationOptsValidator) },
  returns: v.object({
    total: v.number(),
    signupsPerDay: v.array(v.object({ date: v.string(), count: v.number() })),
    timezone: v.string(), isDone: v.boolean(), continueCursor: v.string(),
  }),
  handler: async (ctx, { paginationOpts }) => {
    const total = await ctx.db.query("signupCounts").withIndex("by_key", q => q.eq("key", "total")).unique();
    const days = await ctx.db.query("signupCounts").withIndex("by_key", q => q.lt("key", "total"))
      .paginate(paginationOpts ?? { numItems: 100, cursor: null });
    return {
      total: total?.count ?? 0,
      signupsPerDay: days.page.map(row => ({ date: row.key, count: row.count })),
      timezone: "Asia/Kolkata", isDone: days.isDone, continueCursor: days.isDone ? "" : days.continueCursor,
    };
  },
});
