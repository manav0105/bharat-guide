import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistory} from '../convex/lib/conversation.ts';
test('chat context accepts only the last three completed bounded question-answer pairs',()=>{
 assert.deepEqual(parseHistory(undefined),[]);
 const turn={question:'how to apply for PAN card',answer:'Use the official PAN application service.'};
 assert.deepEqual(parseHistory([turn,turn,turn]),[turn,turn,turn]);
 assert.equal(parseHistory([turn,turn,turn,turn]),null);
 assert.equal(parseHistory([{question:'x'.repeat(501),answer:'a'}]),null);
 assert.equal(parseHistory([{question:'PAN',answer:'a'.repeat(4001)}]),null);
 assert.equal(parseHistory([{question:'PAN'}]),null);
 assert.equal(parseHistory({question:'PAN',answer:'x'}),null);
 assert.deepEqual(parseHistory([{...turn,personalProfile:'not passed through'}]),[turn]);
});
import {isFollowUp,earlierSubject,anchorQuery,hasSubjectInTopFive} from '../convex/lib/conversation.ts';

test('follow-up searches retain the earlier user subject and reject unrelated top five results',()=>{
 const pan=[{question:'how to apply for PAN card',answer:'Apply online.'},{question:'what documents do I need?',answer:'A document list.'}];
 assert.equal(isFollowUp('how long does it take?'),true);
 assert.equal(isFollowUp('who is eligible?'),true);
 assert.equal(isFollowUp('how to apply for PAN card'),false);
 assert.equal(earlierSubject(pan),'PAN card');
 assert.equal(anchorQuery('how long does application take','PAN card'),'how long does application take PAN card');
 assert.equal(anchorQuery('how long does PAN card application take','PAN card'),'how long does PAN card application take');
 const unrelated=Array(5).fill({title:'Scholarships',text:'Student applications and identity documents.'});
 assert.equal(hasSubjectInTopFive([...unrelated,{title:'PAN card',text:'PAN applications.'}],'PAN card'),false);
 assert.equal(hasSubjectInTopFive([{title:'PAN card',text:'PAN applications.'},...unrelated],'PAN card'),true);
 const farmers=[{question:'which scheme gives money to farmers',answer:'A scholarship.'}];
 assert.equal(earlierSubject(farmers),'farmers');
 assert.equal(hasSubjectInTopFive([{title:'Farmer benefit',text:'Eligible farmer households.'}],'farmers'),true);
 const switched=[...pan,{question:'how to apply for passport',answer:'Passport service.'}];
 assert.equal(earlierSubject(switched),'passport');
});
import {retryServiceCall} from '../convex/lib/serviceRetry.ts';

test('busy requests retry three times after 1, 2 and 4 seconds, then recover',async()=>{
 const statuses=[503,429,503,200],delays=[];
 let calls=0;
 const result=await retryServiceCall(async()=>({status:statuses[calls++]}),async ms=>{delays.push(ms);});
 assert.equal(result.status,200);
 assert.equal(calls,4);
 assert.deepEqual(delays,[1000,2000,4000]);
});
test('busy retries stop after four attempts and other errors do not retry',async()=>{
 for(const status of [503,429,400,401]){
  let calls=0;const delays=[];
  const result=await retryServiceCall(async()=>{calls++;return {status};},async ms=>{delays.push(ms);});
  assert.equal(result.status,status);
  assert.equal(calls,[503,429].includes(status)?4:1);
  assert.deepEqual(delays,[503,429].includes(status)?[1000,2000,4000]:[]);
 }
});
