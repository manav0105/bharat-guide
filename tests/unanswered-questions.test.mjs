import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const bundle=async file=>{
 const result=await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',write:false});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
};
const {record}=await bundle('convex/unansweredQuestions.ts');
const {default:http}=await bundle('convex/http.ts');
const ask=http.lookup('/api/ask','POST')[0]._handler;
const NOT_FOUND='I could not find this in official sources';
const request=()=>new Request('https://example.convex.site/api/ask',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'bharat_visitor='+ 'a'.repeat(64)},body:JSON.stringify({question:'  What is a blorp?  ',history:[]})});

test('gap records contain the original question, time and Indian calendar date only',async t=>{
 const now=Date.parse('2026-10-14T18:30:00Z');t.mock.method(Date,'now',()=>now);
 const inserted=[];
 const id=await record._handler({db:{insert:async(table,row)=>{inserted.push({table,row});return 'test-log-id';}}},{question:'  What is a blorp?  '});
 assert.equal(id,'test-log-id');
 assert.deepEqual(inserted,[{table:'unansweredQuestions',row:{question:'What is a blorp?',date:'2026-10-15',askedAt:now}}]);
});
test('generic and state-specific gaps are logged; answers, clarifications and service errors are not',async()=>{
 const results=[
  {answer:NOT_FOUND,sources:[],remaining:19,error:null},
  {answer:"I couldn't find an official Assam page for this",sources:[],remaining:19,error:null,searchQuery:'scholarships by Assam government'},
  {answer:'Are you an Indian travelling abroad, or a foreign national coming to India?',sources:[],remaining:19,error:null},
  {answer:'A supported answer.',sources:[{title:'Government',url:'https://example.gov.in/'}],remaining:19,error:null},
  {answer:'',sources:[],remaining:0,error:'limit'},
  {answer:'',sources:[],remaining:19,error:'unavailable'},
 ];
 for(const result of results){
  const saved=[];
  const response=await ask({runAction:async()=>result,runMutation:async(_,args)=>{saved.push(args);return 'test-log-id';}},request());
  assert.deepEqual(saved,(result.answer===NOT_FOUND||result.answer==="I couldn't find an official Assam page for this")?[{question:'What is a blorp?'}]:[]);
  const body=await response.json();
  if(result.error===null){assert.equal(response.status,200);assert.equal(body.answer,result.answer);assert.equal(body.remaining,19);}
  else assert.equal(response.status,result.error==='limit'?429:503);
 }
});
test('a gap-log outage preserves the citizen response and does not expose the question in logs',async t=>{
 const warnings=[];t.mock.method(console,'warn',message=>warnings.push(message));
 const response=await ask({runAction:async()=>({answer:NOT_FOUND,sources:[],remaining:19,error:null}),runMutation:async()=>{throw new Error('Database unavailable');}},request());
 assert.equal(response.status,200);assert.equal((await response.json()).answer,NOT_FOUND);
 assert.deepEqual(warnings,['Could not save unanswered-question log']);
});
