import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {sourceTitle} from '../convex/lib/answerRules.ts';
const output=await build({entryPoints:['src/AnswerMarkdown.tsx'],bundle:true,platform:'node',format:'esm',jsx:'automatic',write:false,external:['react','react-dom','react/jsx-runtime']});
// Resolve React from the project while keeping the test bundle out of the app.
const {writeFile,unlink,mkdir}=await import('node:fs/promises');
const file=new URL('../.verification/answer-markdown-test.mjs',import.meta.url);
await mkdir(new URL("../.verification/",import.meta.url),{recursive:true});
await writeFile(file,output.outputFiles[0].text);
const {AnswerMarkdown}=await import(file.href);
await unlink(file);
test('Markdown renders formatting and only exact retrieved links with readable titles',()=>{
 const url='https://example.gov.in/guide.pdf';
 const html=renderToStaticMarkup(createElement(AnswerMarkdown,{answer:`**Apply online**\n\n- First step\n- Second step\n\n[https://bad.gov.in](${url}) [Invented](https://example.gov.in/other) <script>alert(1)</script>`,sources:[{url,title:'/files/Passport_Application_Guide.pdf'}]}));
 assert.match(html,/<strong>Apply online<\/strong>/);assert.match(html,/<ul>/);assert.match(html,/<li>First step<\/li>/);
 assert.match(html,/target="_blank"/);assert.match(html,/rel="noopener noreferrer"/);
 assert.match(html,/>Passport Application Guide<\/a>/);assert.equal((html.match(/<a /g)||[]).length,1);
 assert.ok(!html.includes('href="https://example.gov.in/other"'));assert.ok(!html.includes('<script>'));
 assert.equal(sourceTitle('/files/Passport%20Application%20Guide.pdf'),'Passport Application Guide');
 assert.equal(sourceTitle('/documents/Updated_FAQs.pdf/123-456'),'Updated FAQs');
 assert.equal(sourceTitle('Scholarships | Higher Education | Government Of Assam, India'),'Scholarships');
});
