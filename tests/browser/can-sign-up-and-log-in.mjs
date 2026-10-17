import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';

const base = process.env.BHARAT_AUTH_TEST_URL || 'http://127.0.0.1:5175';
const prefix = base.startsWith('https://') ? 'auth-live' : 'auth-local';
const email = `bharat-guide-proof-${Date.now()}@example.com`;
const password = randomBytes(24).toString('base64url');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const proof = { base, email, checks: [], layouts: [] };
  const errors = [];
const sizes = [[1280, 800], [820, 900], [390, 844]];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let signedInAuthorization;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/ask' && request.headers().authorization) signedInAuthorization = request.headers().authorization;
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await expect(page.getByRole('status').filter({ hasText: '20 of 20' })).toBeVisible();
  const baselineComposer = await page.locator('.chat-composer').boundingBox();
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width }; };
      return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, header: rect('.site-header'), composer: rect('.chat-composer') };
    });
    expect(layout.scrollWidth).toBeLessThanOrEqual(width);
    expect(layout.composer.bottom).toBeCloseTo(height, 0);
    proof.layouts.push(layout);
    await page.screenshot({ path: `.verification/${prefix}-${width}-header.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  async function ask(question, status = 200) {
    await page.getByLabel('What would you like to know?').fill(question);
    const pending = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ask' && r.request().method() === 'POST', { timeout: 240000 });
    await page.getByRole('button', { name: 'Find an answer', exact: true }).click();
    const response = await pending;
    expect(response.status()).toBe(status);
    return response.json();
  }
  for (const [index, question] of ['zxyqvblorptasticnonword', 'blorptasticpurplemoonsalpha', 'blorptasticpurplemoonsbeta'].entries()) {
    const body = await ask(question);
    expect(body.remaining).toBe(19 - index);
    expect(body.answer).toBe('I could not find this in official sources');
    expect(body.sources).toEqual([]);
  }
  const chat = await page.getByRole('log').innerText();
  const cookiesBefore = await page.context().cookies();
  const visitorBefore = cookiesBefore.find(cookie => cookie.name === 'bharat_visitor')?.value;
  expect(visitorBefore).toBeTruthy();
  let fourthRequests = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === '/api/ask') fourthRequests++; });
  await page.getByLabel('What would you like to know?').fill('blorptasticpurplemoonsfourth');
  await page.getByRole('button', { name: 'Find an answer', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign up free to keep asking' })).toBeVisible();
  expect(fourthRequests).toBe(0);
  expect(await page.getByRole('log').innerText()).toBe(chat);
  expect(await page.getByLabel('What would you like to know?').inputValue()).toBe('blorptasticpurplemoonsfourth');
  for (const [width, height] of sizes) {
    // A fresh viewport avoids Chromium's stale screenshot painting when a
    // scrolled native dialog is resized. Use the actual chat and same cookie.
    const shot = await page.context().newPage();
    await shot.setViewportSize({ width, height });
    await shot.addInitScript(chat => sessionStorage.setItem('bharat-guide-chat-v1', chat),
      await page.evaluate(() => sessionStorage.getItem('bharat-guide-chat-v1')));
    await shot.goto(base, { waitUntil: 'networkidle' });
    await shot.getByLabel('What would you like to know?').fill('blorptasticpurplemoonsfourth');
    await shot.getByRole('button', { name: 'Find an answer', exact: true }).click();
    await expect(shot.getByRole('dialog')).toBeVisible();
    const box = await shot.getByRole('dialog').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await shot.screenshot({ path: `.verification/${prefix}-${width}-signup.png` });
    await shot.close();
  }
  // Bypass the browser guard: the server must also reject the fourth request.
  const denied = await page.request.post(`${base}/api/ask`, { data: { question: 'blorptasticpurplemoonsfourth', history: [] } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).code).toBe('SIGNUP_REQUIRED');
  const allowance = await (await page.request.get(`${base}/api/visitor`)).json();
  expect(allowance.remaining).toBe(17);
  expect(allowance.anonymousRemaining).toBe(0);
  proof.checks.push('Three anonymous questions; fourth blocked in browser and server without charging; chat and draft preserved.');

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign up free', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  expect(await page.getByRole('log').innerText()).toBe(chat);
  const fourth = await ask('blorptasticpurplemoonsfourth');
  expect(fourth.remaining).toBe(16);
  proof.checks.push('Email/password sign-up; fourth question succeeds; same daily allowance and visitor cookie.');
  const signedInChat = await page.getByRole('log').innerText();

  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  expect(await page.getByRole('log').innerText()).toBe(signedInChat);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(randomBytes(24).toString('base64url'));
  await page.getByRole('dialog').getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Could not log in', { timeout: 30000 });
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('dialog').getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  expect(await page.getByRole('log').innerText()).toBe(signedInChat);
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
  expect(await page.getByRole('log').innerText()).toBe(signedInChat);
  expect((await page.context().cookies()).find(cookie => cookie.name === 'bharat_visitor')?.value).toBe(visitorBefore);
  proof.checks.push('Log out, reject wrong password, log back in, reload; chat and visitor cookie preserved.');

  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `.verification/${prefix}-${width}-logged-in.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const afterComposer = await page.locator('.chat-composer').boundingBox();
  expect(afterComposer.y).toBeCloseTo(baselineComposer.y, 0);
  expect(afterComposer.height).toBeCloseTo(baselineComposer.height, 0);
  expect(errors).toEqual([]);
  proof.checks.push('1280px, 820px, 390px: no horizontal overflow; phone composer position and height unchanged; no page errors.');
  // Keep using this same visitor and account: sign-up/login must not reset 20.
  const quotaResponses = [];
  for (let index = 0; index < 16; index++) {
    const response = await page.request.post(`${base}/api/ask`, {
      headers: { Authorization: signedInAuthorization },
      data: { question: 'zxyqvblorptasticnonword', history: [] },
    });
    expect(response.status()).toBe(200);
    quotaResponses.push((await response.json()).remaining);
  }
  expect(quotaResponses).toEqual(Array.from({ length: 16 }, (_, i) => 15 - i));
  const limited = await page.request.post(`${base}/api/ask`, {
    headers: { Authorization: signedInAuthorization }, data: { question: 'zxyqvblorptasticnonword', history: [] },
  });
  expect(limited.status()).toBe(429);
  proof.checks.push('Same visitor reaches exactly 20 questions across sign-up/logout/login; question 21 returns HTTP 429.');
  proof.checkedAt = new Date().toISOString();
  fs.writeFileSync(`.verification/${prefix}-proof.json`, JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Auth proof failed');
  process.exitCode = 1;
} finally { await browser.close(); }
