// One-time, administrator-only cleanup. The citizen-facing app cannot call this.
import { internalMutation, internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, getDocumentSize } from "convex/values";

const measuredRow = v.object({ sourceId: v.string(), index: v.number(), total: v.number(), bytes: v.number() });
export const measurePage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ rows: v.array(measuredRow), cursor: v.string(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("documents").withIndex("by_source_chunk").paginate({cursor: args.cursor, numItems:500});
    return { rows:page.page.map(r=>({sourceId:r.sourceId,index:r.chunkIndex,total:r.chunkCount,bytes:getDocumentSize(r)})),cursor:page.continueCursor,done:page.isDone };
  },
});

export const measure = internalAction({
  args: {},
  returns: v.object({ documents:v.number(),chunks:v.number(),recordBytes:v.number(),indexBytes:v.number(),databaseBytes:v.number(),complete:v.boolean() }),
  handler: async (ctx): Promise<{documents:number;chunks:number;recordBytes:number;indexBytes:number;databaseBytes:number;complete:boolean}> => {
    let cursor:string|null=null; let chunks=0; let recordBytes=0;
    const sources=new Map<string,{expected:number;indices:Set<number>}>();
    while(true){
      const page:{rows:{sourceId:string;index:number;total:number;bytes:number}[];cursor:string;done:boolean}=await ctx.runQuery(internal.storageCleanup.measurePage,{cursor});
      for(const r of page.rows){
        const source=sources.get(r.sourceId)||{expected:r.total,indices:new Set<number>()};
        if(source.expected!==r.total||source.indices.has(r.index)||r.index<0||r.index>=r.total)throw new Error("Inconsistent source chunks.");
        source.indices.add(r.index);sources.set(r.sourceId,source);chunks++;recordBytes+=r.bytes;
      }
      if(page.done)break;cursor=page.cursor;
    }
    const complete=[...sources.values()].every(s=>s.expected===s.indices.size);
    return {documents:sources.size,chunks,recordBytes,indexBytes:recordBytes*4,databaseBytes:recordBytes*5,complete};
  },
});

export const remove = internalMutation({
  args: { rows: v.array(v.object({ id: v.id("documents"), sourceId: v.string(), textLength: v.number() })) },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (args.rows.length > 250) throw new Error("Use batches of at most 250 chunks.");
    let count = 0;
    for (const expected of args.rows) {
      const row = await ctx.db.get(expected.id);
      if (!row) continue; // safe to resume an interrupted batch
      if (row.sourceId !== expected.sourceId || row.text.length !== expected.textLength) {
        throw new Error("A chunk changed since the backup; cleanup stopped.");
      }
      await ctx.db.delete(expected.id);
      count++;
    }
    return count;
  },
});

export const repair = internalMutation({
  args: { sourceId: v.string(), ids: v.array(v.id("documents")) },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!args.ids.length || args.ids.length > 1000) throw new Error("Invalid repair size.");
    const rows = await ctx.db.query("documents").withIndex("by_source_chunk", q => q.eq("sourceId", args.sourceId)).take(args.ids.length + 1);
    if (rows.length !== args.ids.length || rows.some((r,i) => r._id !== args.ids[i])) {
      throw new Error("Remaining chunks differ from the plan; cleanup stopped.");
    }
    for (const [chunkIndex, row] of rows.entries()) {
      await ctx.db.patch(row._id, { chunkIndex, chunkCount: rows.length });
    }
    return rows.length;
  },
});
