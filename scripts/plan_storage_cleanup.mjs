// Read-only planner. It never contacts Convex or changes the database.
import fs from 'node:fs';
import { getDocumentSize } from 'convex/values';
import { usefulChunk } from '../convex/lib/answerRules.ts';

const rows = JSON.parse(fs.readFileSync('.verification/storage-root-documents.json', 'utf8'));
const tasks = JSON.parse(fs.readFileSync('data/priority-topics.json', 'utf8')).topics;
const patterns = tasks.map(task => ({...task,regex:new RegExp(task.matchPattern.replace(/\bpan\b/g,'\\bpan\\b'),'i')}));
const junk = new Set(JSON.parse(fs.readFileSync('.verification/storage-cleanup-candidates.json', 'utf8')).navigationIds);
const pinnedUrls = new Set(['https://www.utiitsl.com/', 'https://www.myscheme.gov.in/schemes/pm-kisan', 'https://www.myscheme.gov.in/schemes/eeepl']);
for (const file of ['bharat-expanded-answers-live.json', 'bharat-five-answers.json', 'bharat-five-answers-local.json']) {
  for (const answer of JSON.parse(fs.readFileSync('.verification/' + file, 'utf8'))) {
    for (const source of answer.sources || []) pinnedUrls.add(source.url);
  }
}
const sources = new Map();
for (const row of rows) {
  let source = sources.get(row.sourceId);
  if (!source) {
    source = { sourceId: row.sourceId, title: row.title, url: row.url, topics: row.topics, rows: [], bytes: 0 };
    sources.set(row.sourceId, source);
  }
  if (!junk.has(row._id)) { source.rows.push(row); source.bytes += getDocumentSize(row); }
}
let inspected = 0;
for (const source of sources.values()) {
  source.official = /\.(?:gov|nic)\.in$/i.test(new URL(source.url).hostname);
  source.pinned = pinnedUrls.has(source.url) || /pm.?kisan|kisan samman/i.test(source.title + source.url);
  source.matches = [];
  source.evidence = {};
  const substantive = source.rows.filter(r => usefulChunk(r.text, r.title)).map(r=>({...r,lines:r.text.split(/\n+/).map(l=>l.trim()).filter(l=>(l.match(/[a-z]{2,}/gi)||[]).length>=8)}));
  const title = (source.title + ' ' + decodeURI(source.url)).replace(/\s+/g, ' ');
  for (const task of patterns) {
    const regex = task.regex;
    const titleMatch = substantive.length > 0 && regex.test(title);
    const chunk = substantive.find(r => r.lines.some(line => {
      if (!regex.test(line)) return false;
      const action = /\b(?:apply|application|register|registration|enrol|enrollment|enrolment|update|correction|download|renew|request|obtain|issue|issued|issuance|withdraw|transfer|activate|check|track|submit|file|filing|pay|payment|claim|eligible|eligibility|benefit|assistance|insurance|subsidy|provides?|receive|entitled|entitlement|deduction|refund|complaint|grievance|pension)\b/i;
      // A certificate listed as a prerequisite is not a page explaining how to get it.
      if (task.id >= 76 && task.id <= 84 && !/\b(?:issue|issued|issuance|obtain|request|apply|registration)\b/i.test(line)) return false;
      return action.test(line);
    }));
    if (titleMatch || chunk) {
      source.matches.push(task.id);
      source.evidence[task.id] = { titleMatch, chunkId: chunk?._id ?? substantive[0]._id };
    }
  }
  if (++inspected % 1000 === 0) console.log(`Matched ${inspected} of ${sources.size} source pages`);
}
const budget = 350 * 1048576 - 24000; // leave room for visitors and hosting records
const keep = new Set(); let used = 0;
const add = source => {
  if (keep.has(source.sourceId)) return true;
  if (used + source.bytes * 5 > budget) return false;
  keep.add(source.sourceId); used += source.bytes * 5; return true;
};
const all = [...sources.values()].filter(s => s.rows.length);
for (const source of all.filter(s => s.pinned)) {
  if (!add(source)) throw new Error('Protected sources exceed the budget. No deletion plan created.');
}
// Give each matching task a page before filling the budget with additional pages.
for (const task of tasks) {
  const candidates = all.filter(s => s.matches.includes(task.id)).sort((a, b) =>
    Number(b.evidence[task.id].titleMatch) - Number(a.evidence[task.id].titleMatch)
    || Number(b.official) - Number(a.official) || a.bytes - b.bytes);
  if (!candidates.some(s => keep.has(s.sourceId))) candidates.some(add);
}
const priority = all.filter(s => s.matches.length).sort((a, b) =>
  Number(b.official) - Number(a.official)
  || b.matches.length - a.matches.length || a.bytes - b.bytes || a.sourceId.localeCompare(b.sourceId));
for (const source of priority) add(source);
for (const source of all.filter(s => s.official && !s.matches.length).sort((a, b) => a.bytes - b.bytes || a.sourceId.localeCompare(b.sourceId))) add(source);
const coverage = tasks.map(t => {
  const kept = all.filter(s => keep.has(s.sourceId) && s.matches.includes(t.id));
  return { id: t.id, task: t.task, pages: kept.length,
    sample: kept.length ? {title: kept[0].title, url: kept[0].url, ...kept[0].evidence[t.id]} : null };
});
const keptRows = all.filter(s => keep.has(s.sourceId)).flatMap(s => s.rows);
const keptIds = new Set(keptRows.map(r => r._id));
const deleted = rows.filter(r => !keptIds.has(r._id));
const plan = { status: 'planned, not applied', targetMB: 350, before: {documents:sources.size, chunks:rows.length, bytes:rows.reduce((n,r)=>n+getDocumentSize(r)*5,0)},
  after: {documents:keep.size, chunks:keptRows.length, documentBytes:used/5, estimatedDatabaseMB:(used+24000)/1048576},
  removedDocuments: sources.size-keep.size, removedChunks:deleted.length,
  estimatedSavedMB:deleted.reduce((n,r)=>n+getDocumentSize(r)*5,0)/1048576,
  priorityPagesKept:all.filter(s=>keep.has(s.sourceId)&&s.matches.length).length,
  priorityPagesAvailable:priority.length, officialFillPages:all.filter(s=>keep.has(s.sourceId)&&s.official&&!s.matches.length).length,
  coveredTasks:coverage.filter(t=>t.pages).length, zeroPages:coverage.filter(t=>!t.pages).map(t=>t.task), coverage,
  keptSourceIds:[...keep], deleteIds:deleted.map(r=>r._id),
  repairs:all.filter(s=>keep.has(s.sourceId)&&s.rows.length!==s.rows[0].chunkCount).map(s=>({sourceId:s.sourceId,ids:s.rows.sort((a,b)=>a.chunkIndex-b.chunkIndex).map(r=>r._id)})) };
if (plan.after.estimatedDatabaseMB > 350 || plan.coverage.some(t=>t.pages===0 && all.some(s=>s.matches.includes(t.id)))) throw new Error('Budget or task coverage failed');
fs.writeFileSync('.verification/priority-storage-plan.json',JSON.stringify(plan,null,2));
console.log(JSON.stringify({...plan,coverage:undefined,keptSourceIds:undefined,deleteIds:undefined,repairs:undefined},null,2));
