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
