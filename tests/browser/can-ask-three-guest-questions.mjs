import { chromium, expect } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.GATE_TEST_URL || 'https://dapper-cricket-388.convex.site';
const label = process.env.GATE_TEST_LABEL || 'gate-live-incognito';
const normal = process.env.GATE_TEST_NORMAL === '1';
const browser = normal ? await chromium.connectOverCDP('http://127.0.0.1:9222')
  : await chromium.launch({ channel: 'chrome', headless: true });
const context = normal ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1280, height: 900 } });
if (process.env.GATE_TEST_LEGACY === '1') {
  if (base !== 'http://127.0.0.1:3211') throw new Error('Legacy fixtures are permitted only in the isolated local database.');
  const token = randomBytes(32).toString('hex');
  const fixture = [{ tokenHash: createHash('sha256').update(token).digest('hex'), day: '2026-10-16', questions: 20 }];
  fs.writeFileSync('.verification/auth-sandbox/gate-legacy-fixture.json', JSON.stringify(fixture));
  const imported = spawnSync(process.execPath, [path.resolve('node_modules/convex/bin/main.js'), 'import', '--table', 'visitors', '--append', 'gate-legacy-fixture.json', '--yes'], { cwd: '.verification/auth-sandbox', encoding: 'utf8' });
  if (imported.status !== 0 && !imported.stdout.includes('Imported')) throw new Error('Could not prepare isolated legacy visitor fixture.');
  await context.addCookies([{ name: 'bharat_visitor', value: token, url: base, httpOnly: true, secure: true, sameSite: 'Lax' }]);
}
const page = await context.newPage();
const proof = { url: base, browser: normal ? 'Connected persistent Chrome window' : 'Fresh isolated incognito context', steps: [] };
try {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/visitor', async route => { await held; await route.continue(); });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('What would you like to know?').fill('how to apply for PAN card');
  await expect(page.getByRole('button', { name: 'Find an answer', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  proof.steps.push({ state: 'visitor count loading', signupBoxVisible: false });
  release();
  await expect(page.getByRole('button', { name: 'Find an answer', exact: true })).toBeEnabled();
  const initial = await (await context.request.get(base + '/api/visitor')).json();
  proof.initial = initial;
  expect(initial.anonymousRemaining).toBe(3);
  const questions = ['how to apply for PAN card', 'what documents do I need for PAN card?', 'how long does it take to get a PAN card?'];
  for (const [index, question] of questions.entries()) {
    await page.getByLabel('What would you like to know?').fill(question);
    const responsePromise = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ask' && r.request().method() === 'POST', { timeout: 240000 });
    await page.getByRole('button', { name: 'Find an answer', exact: true }).click();
    const response = await responsePromise;
    const body = await response.json();
    const allowance = await (await context.request.get(base + '/api/visitor')).json();
    proof.steps.push({ question: index + 1, asked: question, httpStatus: response.status(), ...body, anonymousRemaining: allowance.anonymousRemaining });
    fs.writeFileSync(`.verification/${label}.json`, JSON.stringify(proof, null, 2));
    expect(response.status(), JSON.stringify(body)).toBe(200);
    expect(body.answer.length).toBeGreaterThan(0);
    expect(allowance.anonymousRemaining).toBe(2 - index);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('answer-text')).toHaveCount(index + 1);
    await page.screenshot({ path: `.verification/${label}-answer-${index + 1}.png`, fullPage: true });
  }
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await page.screenshot({ path: `.verification/${label}-three-answers.png`, fullPage: true });
  const chat = await page.getByRole('log').innerText();
  let requests = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/ask') requests++; });
  await page.getByLabel('What would you like to know?').fill('how do I track my PAN card application?');
  await page.getByRole('button', { name: 'Find an answer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign up free to keep asking' })).toBeVisible();
  expect(requests).toBe(0);
  expect(await page.getByRole('log').innerText()).toBe(chat);
  await page.screenshot({ path: `.verification/${label}-fourth-signup.png` });
  const denied = await context.request.post(base + '/api/ask', { data: { question: 'how do I track my PAN card application?', history: [] } });
  const deniedBody = await denied.json();
  expect(denied.status()).toBe(403);
  expect(deniedBody.code).toBe('SIGNUP_REQUIRED');
  proof.steps.push({ question: 4, signupBoxVisible: true, browserQuestionRequests: requests, directServerStatus: denied.status(), directServerResponse: deniedBody });
  const cookie = (await context.cookies(base)).find(c => c.name === 'bharat_visitor');
  const tokenHash = createHash('sha256').update(cookie.value).digest('hex');
  const cwd = base.includes('127.0.0.1') ? '.verification/auth-sandbox' : '.';
  const result = spawnSync(process.execPath, [path.resolve('node_modules/convex/bin/main.js'), 'data', 'visitors', '--limit', '10000', '--format', 'json'], { cwd, encoding: 'utf8' });
  const row = JSON.parse(result.stdout).find(r => r.tokenHash === tokenHash);
  proof.visitorId = row._id;
  proof.final = await (await context.request.get(base + '/api/visitor')).json();
  proof.checkedAt = new Date().toISOString();
  fs.writeFileSync(`.verification/${label}.json`, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  fs.writeFileSync(`.verification/${label}.json`, JSON.stringify(proof, null, 2));
  console.error(error instanceof Error ? error.message : 'Guest gate proof failed');
  process.exitCode = 1;
} finally {
  // Keep the normal-window proof tab available for the builder to inspect.
  await browser.close();
}
