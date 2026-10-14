import {build} from 'esbuild';
import assert from 'node:assert/strict';
import test from 'node:test';

test('Google failures use a subject-preserving backup and never charge twice', async () => {
const bundle=await build({entryPoints:['convex/ai.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {answer}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const savedFetch=globalThis.fetch,savedTimer=globalThis.setTimeout,savedKey=process.env.GOOGLE_API_KEY;
const delays=[];let mutations=0,searches=[],rewriteCalls=0,answerCalls=0;
// Dummy credential and simulated HTTP responses: no external request is made.
process.env.GOOGLE_API_KEY='local-test-placeholder';
globalThis.setTimeout=(callback,ms,...args)=>{delays.push(ms);return savedTimer(callback,0,...args);};
const text='The Income Tax Department receives and processes PAN card applications.';
const chunk={id:'pan-chunk',title:'PAN card applications',text,url:'https://www.incometax.gov.in/'};
const ctx={runMutation:async()=>{mutations++;return {allowed:true,remaining:19};},runQuery:async(_,args)=>{searches.push(args.question);return [chunk];}};
globalThis.fetch=async(_,options)=>{
 const request=JSON.parse(options.body);
 if(request.generationConfig.responseSchema.required.includes('followUp')){rewriteCalls++;return new Response('',{status:503});}
 if(request.generationConfig.responseSchema.required.includes('keywords'))return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({keywords:['PAN card','processing','application']})}]}}]}));
 answerCalls++;return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({relevance:'PAN applications are described; processing time is absent.',found:true,statements:[{text:'The supplied information does not give a processing time, but the Income Tax Department processes PAN card applications.',evidence:[{chunkId:chunk.id,quote:text}]}]})}]}}]}));
};
try{
 const result=await answer._handler(ctx,{question:'how long does it take?',history:[{question:'how to apply for PAN card',answer:'A prior answer about an unrelated topic.'}],tokenHash:'local-test'});
 assert.equal(rewriteCalls,4);assert.equal(mutations,1);assert.equal(answerCalls,1);
 assert.deepEqual(delays,[1000,2000,4000]);
 assert.equal(result.searchQuery,'PAN card how long does it take?');
 assert.equal(result.rewritePath,'backup rewrite');assert.equal(result.error,null);
 assert.ok(searches.every(q=>q.includes('PAN card')));assert.equal(result.sources[0].url,chunk.url);
 console.log('PASS: exhausted rewrite retries use PAN card backup query, preserve citations and charge one question.');
 delays.length=0;mutations=0;let calls=0;
 globalThis.fetch=async(_,options)=>{
  const request=JSON.parse(options.body);
  if(request.generationConfig.responseSchema.required.includes('keywords'))return new Response('',{status:400});
  calls++;return new Response('',{status:429});
 };
 const busy=await answer._handler(ctx,{question:'how to apply for PAN card',history:[],tokenHash:'local-test'});
 assert.equal(calls,4);assert.equal(mutations,1);assert.equal(busy.error,'unavailable');
 assert.equal(busy.searchQuery,'how to apply for PAN card');
 assert.deepEqual(delays,[1000,2000,4000]);
 console.log('PASS: exhausted final-answer retries return a service failure with the searched query and charge one question.');
}finally{
 globalThis.fetch=savedFetch;globalThis.setTimeout=savedTimer;
 if(savedKey===undefined)delete process.env.GOOGLE_API_KEY;else process.env.GOOGLE_API_KEY=savedKey;
}

});
