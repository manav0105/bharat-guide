import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { indiaDay } from "./lib/answerRules";
import type { MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password({
    profile(params) {
      const email = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        throw new Error("Enter a valid email address.");
      }
      return { email };
    },
  })],
  callbacks: {
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId !== null) return;
      const db = (ctx as MutationCtx).db;
      const signedUpAt = Date.now();
      await db.patch(userId, { signedUpAt });
      // User creation and both counters commit together, exactly once.
      for (const key of ["total", indiaDay(signedUpAt)]) {
        const row = await db.query("signupCounts")
          .withIndex("by_key", q => q.eq("key", key)).unique();
        if (row) await db.patch(row._id, { count: row.count + 1 });
        else await db.insert("signupCounts", { key, count: 1 });
      }
    },
  },
});
