import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const sample = v.object({ title: v.string(), url: v.string() });
const item = v.object({
  sourceId: v.string(), chunkIndex: v.number(), chunkCount: v.number(),
  length: v.number(), title: v.string(), url: v.string(),
});

export const page = internalQuery({
  args: { importId: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ items: v.array(item), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("documents")
      .withIndex("by_import", (q) => q.eq("importId", args.importId))
      .paginate({ cursor: args.cursor, numItems: 500 });
    return {
      items: result.page.map((d) => ({
        sourceId: d.sourceId, chunkIndex: d.chunkIndex, chunkCount: d.chunkCount,
        length: [...d.text].length, title: d.title, url: d.url,
      })),
      cursor: result.continueCursor, done: result.isDone,
    };
  },
});

// Admin-only verification, called using the already authenticated Convex CLI.
export const verify = internalAction({
  args: { importId: v.string() },
  returns: v.object({ rows: v.number(), chunks: v.number(), samples: v.array(sample) }),
  handler: async (ctx, args): Promise<{
    rows: number; chunks: number; samples: { title: string; url: string }[];
  }> => {
    let cursor: string | null = null;
    let chunks = 0;
    const sources = new Map<string, { count: number; indices: Set<number> }>();
    const samples: { title: string; url: string }[] = [];
    while (true) {
      const result: { items: {
        sourceId: string; chunkIndex: number; chunkCount: number;
        length: number; title: string; url: string;
      }[]; cursor: string; done: boolean } = await ctx.runQuery(
        internal.documentLoader.page, { importId: args.importId, cursor },
      );
      for (const d of result.items) {
        if (d.length < 1 || d.length > 1000) throw new Error("Invalid chunk length");
        let source = sources.get(d.sourceId);
        if (!source) {
          source = { count: d.chunkCount, indices: new Set() };
          sources.set(d.sourceId, source);
          if (samples.length < 3) samples.push({ title: d.title, url: d.url });
        }
        if (source.count !== d.chunkCount || source.indices.has(d.chunkIndex)
          || d.chunkIndex < 0 || d.chunkIndex >= d.chunkCount) {
          throw new Error("Duplicate or inconsistent chunks");
        }
        source.indices.add(d.chunkIndex);
        chunks++;
      }
      if (result.done) break;
      cursor = result.cursor;
    }
    for (const source of sources.values()) {
      if (source.indices.size !== source.count) throw new Error("Incomplete document");
    }
    return { rows: sources.size, chunks, samples };
  },
});
