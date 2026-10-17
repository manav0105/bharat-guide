import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    signedUpAt: v.optional(v.number()),
  }).index("email", ["email"]).index("phone", ["phone"]),
  signupCounts: defineTable({ key: v.string(), count: v.number() }).index("by_key", ["key"]),
  visitors: defineTable({
    tokenHash: v.string(),
    day: v.string(),
    questions: v.number(),
    guestQuestions: v.optional(v.number()),
  }).index("by_token", ["tokenHash"]),
  unansweredQuestions: defineTable({
    question: v.string(),
    date: v.string(),
    askedAt: v.number(),
  }).index("by_date", ["date"]),
  documents: defineTable({
    title: v.string(),
    text: v.string(),
    url: v.string(),
    host: v.string(),
    topics: v.array(v.string()),
    sourceId: v.string(),
    chunkIndex: v.number(),
    chunkCount: v.number(),
    importId: v.string(),
  })
    .index("by_import", ["importId"])
    .index("by_source_chunk", ["sourceId", "chunkIndex"])
    .searchIndex("search_text", { searchField: "text", filterFields: ["host"] })
    .searchIndex("search_title", { searchField: "title", filterFields: ["host"] }),
});
