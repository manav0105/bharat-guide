import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_LIMIT, NOT_FOUND, canAsk, indiaDay, usedToday, groundedAnswer, usefulChunk, searchQuestion, simpleEnglish } from '../convex/lib/answerRules.ts';

test('twenty questions per Indian calendar day, including midnight reset', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const day = indiaDay(now);
  assert.equal(DAILY_LIMIT, 20);
  assert.equal(canAsk(day, 19, now), true);
  assert.equal(canAsk(day, 20, now), false);
  assert.equal(usedToday('2026-10-13', 20, now), 0);
  assert.equal(canAsk('2026-10-13', 20, now), true);
  assert.equal(indiaDay(Date.parse('2026-10-14T18:29:59Z')), '2026-10-14');
  assert.equal(indiaDay(Date.parse('2026-10-14T18:30:00Z')), '2026-10-15');
});

test('unsupported output, invented sources and overlong answers fail closed', () => {
  const chunk = { id: 'c1', title: 'Example scheme', text: 'Eligible farmers receive financial assistance of Rs. 6000 per year.', url: 'https://example.gov.in/scheme' };
  const valid = { found: true, statements: [{ text: 'Eligible farmers get Rs. 6000 each year.', evidence: [{ chunkId: 'c1', quote: chunk.text }] }] };
  assert.deepEqual(groundedAnswer(valid, [chunk]).sources, [{ title: chunk.title, url: chunk.url }]);
  assert.equal(groundedAnswer({ found: false, statements: [] }, [chunk]).answer, NOT_FOUND);
  const inventedQuote = structuredClone(valid);
  inventedQuote.statements[0].evidence[0].quote = 'All farmers get Rs. 50000 per year.';
  assert.equal(groundedAnswer(inventedQuote, [chunk]).answer, NOT_FOUND);
  const inventedId = structuredClone(valid);
  inventedId.statements[0].evidence[0].chunkId = 'missing';
  assert.equal(groundedAnswer(inventedId, [chunk]).answer, NOT_FOUND);
  const tooLong = structuredClone(valid);
  tooLong.statements[0].text = Array(201).fill('word').join(' ');
  assert.equal(groundedAnswer(tooLong, [chunk]).answer, NOT_FOUND);
  assert.equal(groundedAnswer(valid, [{ ...chunk, url: 'javascript:alert(1)' }]).answer, NOT_FOUND);
  assert.equal(groundedAnswer(valid, [{ ...chunk, url: 'https://university.ac.in/scheme' }]).sources[0].url, 'https://university.ac.in/scheme');
});

test('navigation and contact text are excluded, useful scheme text is retained', () => {
  assert.equal(usefulChunk('Home\nMenu\nContact Us\nAbout Us\nPrivacy Policy\nTerms and conditions\nAccessibility\nBack to Top', 'A scheme'), false);
  assert.equal(usefulChunk('Contact Us\nPlease contact the department in our main office for all enquiries and general information about this website.\nEmail: office@example.gov.in', 'Contact Us'), false);
  assert.equal(usefulChunk('Home\nEligible farmers can receive financial assistance of Rs. 6000 per year under this scheme.\nContact Us', 'Farmer support'), true);
  assert.equal(searchQuestion('Which scheme gives money to farmers?'), 'farmers');
});

test('hospital wording becomes plain English without changing the amount', () => {
  assert.equal(simpleEnglish('It provides Rs. 5 lakhs for secondary and tertiary care hospitalization at empanelled hospitals.'),
    'It provides Rs. 5 lakhs for hospital treatment at approved hospitals.');
});

test('a bad quotation in one statement does not discard a fully supported statement', () => {
  const first = { id: 'first', title: 'Farmer support', text: 'Farmers who own land can get help to buy a smartphone.', url: 'https://example.gov.in/farmers' };
  const second = { id: 'second', title: 'Irrigation support', text: 'Irrigation subsidies are available for Schedule Tribe farmers.', url: 'https://example.gov.in/irrigation' };
  const reply = { found: true, statements: [
    { text: 'Farmers who own land can get help to buy a smartphone.', evidence: [{ chunkId: 'first', quote: first.text }] },
    { text: 'Irrigation subsidies are available for Scheduled Tribe farmers.', evidence: [{ chunkId: 'second', quote: 'Irrigation subsidies are available for Scheduled Tribe farmers.' }] },
  ] };
  assert.deepEqual(groundedAnswer(reply, [first, second]), {
    answer: reply.statements[0].text,
    sources: [{ title: first.title, url: first.url }],
  });
});

test('administrative instructions and requested contact facts are usable, menus are not', () => {
  assert.equal(usefulChunk('To update your address in the electoral roll, submit Form 8 with your proof of address.', 'Voter registration'), true);
  assert.equal(usefulChunk('Contact Us\nPhone: 1800-000-000\nEmail: office@example.gov.in', 'Contact Us', 'What is the office phone number?'), true);
  assert.equal(usefulChunk('Home\nMenu\nPAN\nTax\nApply\nRegistration\nContact Us\nSitemap', 'PAN services'), false);
});

test('answer links must exactly match a retrieved source URL', () => {
  const chunk = {id:'links',title:'Official instructions',text:'Submit the completed application to the local office for processing.',url:'https://example.gov.in/empanelled/form_(8)?lang=en'};
  const reply = text => ({found:true,statements:[{text,evidence:[{chunkId:chunk.id,quote:chunk.text}]}]});
  const linked = `**How to apply**\n- **Read** [Official instructions](${chunk.url}).\n\nOfficial source: [Official instructions](${chunk.url})`;
  assert.equal(groundedAnswer(reply(linked),[chunk]).answer,linked);
  assert.equal(groundedAnswer(reply(`Read [Official instructions](<${chunk.url}>)`),[chunk]).answer,`Read [Official instructions](<${chunk.url}>)`);
  assert.equal(groundedAnswer(reply(`Read ${chunk.url}`),[chunk]).sources[0].url,chunk.url);
  for(const url of ['https://evil.example/form',chunk.url+'/extra',chunk.url+'#section',chunk.url+'&other=1',chunk.url.replace('example.gov.in','EXAMPLE.gov.in'),'//example.gov.in/form','javascript:alert(1)','mailto:office@example.gov.in']) {
    assert.equal(groundedAnswer(reply(`Read [instructions](${url})`),[chunk]).answer,NOT_FOUND,url);
  }
  assert.equal(groundedAnswer(reply(`Read [https://evil.example/form](${chunk.url})`),[chunk]).answer,NOT_FOUND);
  assert.equal(groundedAnswer(reply(`Read [instructions](${chunk.url}) and https://evil.example/form`),[chunk]).answer,NOT_FOUND);
  assert.equal(groundedAnswer(reply('Read [instructions][ref]\n[ref]: https://evil.example/form'),[chunk]).answer,NOT_FOUND);
  const bodyOnly={...chunk,text:chunk.text+' More at https://other.gov.in/form.'};
  assert.equal(groundedAnswer(reply('Read [instructions](https://other.gov.in/form)'),[bodyOnly]).answer,NOT_FOUND);
});

test('source references expand only to exact retrieved titles and URLs',()=>{
 const chunk={id:'retrieved',title:'Financial Assistance for empanelled hospitals',url:'https://example.gov.in/empanelled',text:'Eligible applicants can submit their application through the official service.'};
 const reply=text=>({found:true,statements:[{text,evidence:[{chunkId:chunk.id,quote:chunk.text}]}]});
 assert.equal(groundedAnswer(reply('Read [[source:retrieved]].'),[chunk]).answer,`Read [${chunk.title}](${chunk.url}).`);
 assert.equal(groundedAnswer(reply('Read [[source:not-retrieved]].'),[chunk]).answer,NOT_FOUND);
 assert.equal(groundedAnswer(reply('Read [[source:retrieved'),[chunk]).answer,NOT_FOUND);
 assert.equal(groundedAnswer(reply('Read [[source:retrieved]] and [apply](https://evil.example/).'),[chunk]).answer,NOT_FOUND);
});

 test('the usual word cap stays in place while an explicit longer-answer budget permits detail',()=>{
 const chunk={id:'c1',title:'Official guide',text:'This official guide contains supported information for citizens.',url:'https://example.gov.in/guide'};
 const raw={found:true,statements:[{text:'Supported '.repeat(220),evidence:[{chunkId:'c1',quote:chunk.text}]}]};
 assert.equal(groundedAnswer(raw,[chunk]).answer,NOT_FOUND);
 assert.notEqual(groundedAnswer(raw,[chunk],400).answer,NOT_FOUND);
 });
