import { internalAction, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

const sample = v.object({ title: v.string(), url: v.string() });
const item = v.object({
  sourceId: v.string(), chunkIndex: v.number(), chunkCount: v.number(),
  length: v.number(), title: v.string(), url: v.string(),
});
const inventoryItem = v.object({
  sourceId: v.string(), url: v.string(), topics: v.array(v.string()), importId: v.string(),
  chunkIndex: v.number(), chunkCount: v.number(), length: v.number(),
});

export const inventoryPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ items: v.array(inventoryItem), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("documents").withIndex("by_source_chunk")
      .paginate({ cursor: args.cursor, numItems: 1000 });
    return {
      items: result.page.map((d) => ({ sourceId: d.sourceId, url: d.url, topics: d.topics,
        importId: d.importId, chunkIndex: d.chunkIndex, chunkCount: d.chunkCount, length: [...d.text].length })),
      cursor: result.continueCursor, done: result.isDone,
    };
  },
});

export const inventory = internalAction({
  args: {},
  returns: v.object({
    rows: v.number(), chunks: v.number(),
    sources: v.array(v.object({ sourceId: v.string(), url: v.string(), topics: v.array(v.string()), importId: v.string() })),
    imports: v.array(v.object({ importId: v.string(), rows: v.number(), chunks: v.number() })),
  }),
  handler: async (ctx): Promise<{
    rows: number; chunks: number;
    sources: { sourceId: string; url: string; topics: string[]; importId: string }[];
    imports: { importId: string; rows: number; chunks: number }[];
  }> => {
    let cursor: string | null = null;
    let chunks = 0;
    const sources = new Map<string, {
      sourceId: string; url: string; topics: string[]; importId: string;
      count: number; indices: Set<number>;
    }>();
    const imports = new Map<string, { importId: string; rows: number; chunks: number }>();
    while (true) {
      const result: { items: {
        sourceId: string; url: string; topics: string[]; importId: string;
        chunkIndex: number; chunkCount: number; length: number;
      }[]; cursor: string; done: boolean } = await ctx.runQuery(internal.documentLoader.inventoryPage, { cursor });
      for (const d of result.items) {
        if (d.length < 1 || d.length > 1000) throw new Error("Invalid chunk length");
        let source = sources.get(d.sourceId);
        if (!source) {
          source = { sourceId: d.sourceId, url: d.url, topics: d.topics, importId: d.importId,
            count: d.chunkCount, indices: new Set<number>() };
          sources.set(d.sourceId, source);
          const batch = imports.get(d.importId) || { importId: d.importId, rows: 0, chunks: 0 };
          batch.rows++;
          imports.set(d.importId, batch);
        }
        if (source.count !== d.chunkCount || source.importId !== d.importId || source.url !== d.url
          || source.indices.has(d.chunkIndex) || d.chunkIndex < 0 || d.chunkIndex >= d.chunkCount) {
          throw new Error("Duplicate or inconsistent chunks");
        }
        source.indices.add(d.chunkIndex);
        imports.get(d.importId)!.chunks++;
        chunks++;
      }
      if (result.done) break;
      cursor = result.cursor;
    }
    for (const source of sources.values()) {
      if (source.indices.size !== source.count) throw new Error("Incomplete document");
    }
    return {
      rows: sources.size, chunks,
      sources: [...sources.values()].map(({ sourceId, url, topics, importId }) => ({ sourceId, url, topics, importId })),
      imports: [...imports.values()],
    };
  },
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
