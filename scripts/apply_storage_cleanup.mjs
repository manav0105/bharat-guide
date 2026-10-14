// Administrator-only runner. No Hugging Face downloads and no credentials in output.
import fs from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

if (!process.argv.includes('--apply')) throw new Error('Pass --apply only after reviewing .verification/priority-storage-plan.json.');
const backup=fs.readFileSync('.verification/storage-root-documents.json');
const rows=JSON.parse(backup);
const plan=JSON.parse(fs.readFileSync('.verification/priority-storage-plan.json','utf8'));
const byId=new Map(rows.map(r=>[r._id,r]));
if(plan.after.estimatedDatabaseMB>350 || plan.deleteIds.length!==plan.removedChunks || new Set(plan.deleteIds).size!==plan.deleteIds.length)throw new Error('Invalid deletion plan');
const keep=new Set(plan.keptSourceIds);
for(const id of plan.deleteIds){const r=byId.get(id);if(!r)throw new Error('Deletion is not backed up');if(keep.has(r.sourceId)&&!plan.repairs.some(s=>s.sourceId===r.sourceId))throw new Error('Unexpected partial deletion');}
fs.writeFileSync('.verification/storage-backup-manifest.json',JSON.stringify({sha256:createHash('sha256').update(backup).digest('hex'),rows:rows.length,deployment:'dapper-cricket-388',createdAt:new Date().toISOString()},null,2));
const token=JSON.parse(fs.readFileSync(homedir()+'/.convex/config.json','utf8')).accessToken;
const response=await fetch('https://provision.convex.dev/api/deployment/authorize_within_current_project',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({selectedDeploymentName:'dapper-cricket-388',projectSelection:{kind:'deploymentName',deploymentName:'dapper-cricket-388',deploymentType:'dev'}})});
if(!response.ok)throw new Error('Convex administrator authorization failed: '+response.status);
const deployment=await response.json();
if(deployment.url!=='https://dapper-cricket-388.convex.cloud')throw new Error('Unexpected deployment');
const client=new ConvexHttpClient(deployment.url);
client.setAdminAuth(deployment.adminKey);
const measure=await client.action(makeFunctionReference('storageCleanup:measure'),{});
if(measure.chunks!==plan.before.chunks || measure.documents!==plan.before.documents || measure.databaseBytes!==plan.before.bytes || !measure.complete)throw new Error('Database differs from the backup. Nothing deleted.');
console.log('Verified the backup against all live source/chunk counts and database bytes.');
let deleted=0;
for(let start=0;start<plan.deleteIds.length;start+=250){
 const batch=plan.deleteIds.slice(start,start+250).map(id=>{const r=byId.get(id);return {id,sourceId:r.sourceId,textLength:r.text.length};});
 deleted+=await client.mutation(makeFunctionReference('storageCleanup:remove'),{rows:batch});
 fs.writeFileSync('.verification/storage-cleanup-progress.json',JSON.stringify({processed:start+batch.length,deleted,total:plan.deleteIds.length}));
 if(start%5000===0||start+250>=plan.deleteIds.length)console.log(`Deleted ${deleted} of ${plan.deleteIds.length} planned chunks`);
}
for(const source of plan.repairs)await client.mutation(makeFunctionReference('storageCleanup:repair'),source);
const after=await client.action(makeFunctionReference('storageCleanup:measure'),{});
fs.writeFileSync('.verification/storage-after-measurement.json',JSON.stringify(after,null,2));
if(!after.complete || after.documents!==plan.after.documents || after.chunks!==plan.after.chunks || after.recordBytes!==plan.after.documentBytes)throw new Error('Post-cleanup verification failed. Backup remains available.');
console.log('Measured Convex after cleanup: '+JSON.stringify(after));
console.log('Documents table including indexes: '+(after.databaseBytes/1048576).toFixed(6)+' MB');
plan.status='applied and verified';fs.writeFileSync('.verification/priority-storage-plan.json',JSON.stringify(plan,null,2));
