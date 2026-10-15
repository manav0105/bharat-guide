import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';
import {requestedStates,matchesRequestedState,stateNotFound,countryOrMissionRequested,isMission,sourcePriority,clarification} from '../convex/lib/sourcePolicy.ts';
const chunk=(id,url,title,text='Read the official instructions to apply for the service.')=>({_id:id,id,url,title,text});
test('national sources outrank missions unless the citizen names a country or mission',()=>{
 const national=chunk('n','https://www.passportindia.gov.in/psp','Passport Seva');
 const mission=chunk('m','https://www.indianembassywarsaw.gov.in/','Embassy of India, Warsaw');
 assert.equal(isMission(mission),true);assert.equal(isMission(national),false);assert.equal(isMission(chunk('ministry','https://mea.gov.in/visa','Indian Embassy visa services')),false);
 assert.ok(sourcePriority(national,'passport application')>sourcePriority(mission,'passport application'));
 for(const question of ['passport in Poland','US passport service','passport at the embassy','visa for UK','visa for Japan'])assert.equal(sourcePriority(mission,question),sourcePriority(national,question));
 assert.equal(countryOrMissionRequested('help us apply for a passport'),false);
 assert.equal(sourcePriority(chunk('s','https://highereducation.assam.gov.in/','Higher Education Assam'),'scholarships'),1);
});
test('state matching allows the state publisher or an explicit substantive mention only',()=>{
 const state=requestedStates('scholarships by Assam government');assert.equal(state[0].name,'Assam');
 assert.ok(matchesRequestedState(chunk('a','https://highereducation.assam.gov.in/','Scholarship'),state));
 assert.ok(matchesRequestedState(chunk('a','https://ceoassam.nic.in/','Electoral information'),state));
 assert.ok(matchesRequestedState(chunk('a','https://www.myscheme.gov.in/schemes/example','Scholarship','Applicants must be residents of Assam to apply.'),state));
 assert.equal(matchesRequestedState(chunk('k','https://kerala.gov.in/','Kerala scholarship'),state),false);
 assert.equal(matchesRequestedState(chunk('n','https://education.gov.in/','National scholarship'),state),false);
 assert.equal(matchesRequestedState(chunk('m','https://example.gov.in/','Portal','Home\nAssam\nKerala\nContact'),state),false);
 assert.equal(stateNotFound('scholarships by Assam government'),"I couldn't find an official Assam page for this");
 assert.equal(stateNotFound('national scholarships'),null);
 for(const name of ['Tamil Nadu','West Bengal','Uttar Pradesh','Odisha','Jammu and Kashmir','Puducherry'])assert.equal(requestedStates(name)[0].name,name);
});
test('visa ambiguity asks one question, clear destinations and unrelated services do not',()=>{
 for(const q of ['visa process?','How do I apply for a visa?','tourist visa'])assert.equal(clarification(q),'Are you an Indian travelling abroad, or a foreign national coming to India?');
 for(const q of ['Indian visa application','visa for France','scholarships by Assam government','how to apply for a passport'])assert.equal(clarification(q),null);
});
test('the actual search filters state pages and preserves their related chunks before ranking',async()=>{
 const bundle=await build({entryPoints:['convex/questions.ts'],bundle:true,platform:'node',format:'esm',write:false});const {search}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 let searches=[];let matches=[chunk('mission','https://www.indianembassywarsaw.gov.in/','Embassy of India','Passport applications can be submitted through our consular service at the Embassy of India.'),chunk('national','https://www.passportindia.gov.in/psp','Passport Seva','Passport applications are handled through the official Passport Seva portal.')];
 const ctx={db:{query:()=>({withSearchIndex:(_,apply)=>{apply({search:(field,terms)=>{searches.push(terms);return {};}});return {take:async()=>matches};}})}};
 const national=await search._handler(ctx,{question:'how to apply for a passport'});assert.equal(national[0].id,'national');
 const abroad=await search._handler(ctx,{question:'how to apply for a passport in Poland'});assert.equal(abroad[0].id,'mission');
 matches=[chunk('kerala','https://kerala.gov.in/scholarships','Scholarships Kerala','Kerala residents may submit their scholarship application online.'),chunk('intro','https://www.myscheme.gov.in/schemes/assam-students','Scholarship','Eligible applicants must be permanent residents of Assam to apply for this scholarship programme.'),chunk('steps','https://www.myscheme.gov.in/schemes/assam-students','Scholarship','Submit the completed scholarship application and your supporting documents online.')];
 const assam=await search._handler(ctx,{question:'scholarships by Assam government',keywords:['scholarship','student','benefit']});assert.deepEqual(assam.map(c=>c.id),['intro','steps']);assert.ok(searches.at(-1).includes('assam'));
 const official=chunk('assam-official','https://highereducation.assam.gov.in/scholarships','Assam scholarships','Eligible students can submit applications for scholarships from the Assam government.');
 matches.push(official);assert.deepEqual((await search._handler(ctx,{question:'scholarships by Assam government'})).map(c=>c.id),['assam-official']);
 matches=matches.slice(0,1);assert.deepEqual(await search._handler(ctx,{question:'scholarships by Assam government'}),[]);
});

test('clarification and a missing state page each charge once without making an answer call',async()=>{
 const bundle=await build({entryPoints:['convex/ai.ts'],bundle:true,platform:'node',format:'esm',write:false});const {answer}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const oldKey=process.env.GOOGLE_API_KEY,oldFetch=globalThis.fetch;process.env.GOOGLE_API_KEY='local-test-placeholder';let reserved=0,queries=0;
 globalThis.fetch=async()=>{throw new Error('These paths must not call the AI provider');};
 const ctx={runMutation:async()=>{reserved++;return {allowed:true,remaining:19};},runQuery:async()=>{queries++;return [];}};
 try{
  const vague=await answer._handler(ctx,{question:'visa process?',history:[],tokenHash:'test',diagnostics:true});assert.equal(vague.answer,clarification('visa process?'));assert.equal(reserved,1);assert.equal(queries,0);assert.deepEqual(vague.diagnostics.chunks,[]);
  const assam=await answer._handler(ctx,{question:'scholarships by Assam government',history:[],tokenHash:'test'});assert.equal(assam.answer,"I couldn't find an official Assam page for this");assert.equal(reserved,2);assert.equal(queries,1);assert.equal(assam.error,null);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GOOGLE_API_KEY;else process.env.GOOGLE_API_KEY=oldKey;}
});

test('an invalid generated URL is rejected and repaired against the retrieved URL list',async()=>{
 const bundle=await build({entryPoints:['convex/ai.ts'],bundle:true,platform:'node',format:'esm',write:false});const {answer}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const oldKey=process.env.GOOGLE_API_KEY,oldFetch=globalThis.fetch;process.env.GOOGLE_API_KEY='local-test-placeholder';let reserved=0,calls=0;
 const source={id:'official',title:'Assam scholarship',url:'https://education.assam.gov.in/scholarship',text:'Assam students can submit the scholarship application through the official department.'};
 globalThis.fetch=async(_,options)=>{const request=JSON.parse(options.body);if(request.generationConfig.responseSchema.required.includes('keywords'))return new Response('',{status:400});calls++;
  const data=JSON.parse(request.contents[0].parts[0].text);assert.deepEqual(data.allowedSourceUrls,[source.url]);
  if(calls===2)assert.ok(data.rejectedDraft.includes('https://not-retrieved.example/apply'));
  const text=calls===1?'Apply at [portal](https://not-retrieved.example/apply).':`Read [Assam scholarship](${source.url}) for the application instructions.`;
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({found:true,relevance:'Assam scholarship',statements:[{text,evidence:[{chunkId:source.id,quote:source.text}]}]})}]}}]}));};
 try{const result=await answer._handler({runMutation:async()=>{reserved++;return {allowed:true,remaining:19};},runQuery:async()=>[source]},{question:'Assam scholarship application',history:[],tokenHash:'test'});assert.equal(reserved,1);assert.equal(calls,2);assert.equal(result.error,null);assert.equal(result.sources[0].url,source.url);assert.ok(!result.answer.includes('not-retrieved'));}
 finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.GOOGLE_API_KEY;else process.env.GOOGLE_API_KEY=oldKey;}
});
