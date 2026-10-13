import { test, expect } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';

const missing = 'I could not find this in official sources';
const questions = [
  'schemes for farmers',
  'health insurance for poor families',
  'scholarship for girl students',
  'How do I apply for a passport?',
  'blorptastic purple moons eat zigzag umbrellas',
];

test('a citizen gets five honest answers with exact government sources', async ({ page }) => {
  const errors: string[] = [];
  const providerRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/generativelanguage|openai\.com/.test(request.url())) providerRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: '20 of 20' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.verification/bharat-mobile.png', fullPage: true });
  const records: { question: string; answer: string; sources: { title: string; url: string }[] }[] = [];
  for (const [index, question] of questions.entries()) {
    await page.getByLabel('What would you like to know?').fill(question);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/ask') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Find an answer', exact: true }).click();
    const response = await responsePromise;
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(200);
    expect(body).not.toHaveProperty('diagnostics');
    await expect(page.getByTestId('answer-text')).toHaveText(body.answer.replace(/\n\n/g, ''), { useInnerText: false });
    expect(body.remaining).toBe(19 - index);
    expect(body.answer.trim().split(/\s+/).length).toBeLessThanOrEqual(200);
    records.push({ question, answer: body.answer, sources: body.sources });
    // Save even if a later assertion fails, so actual answers are reviewable.
    await mkdir('.verification', { recursive: true });
    await writeFile('.verification/bharat-five-answers.json', JSON.stringify(records, null, 2));
    console.log(`Question: ${question}\nAnswer: ${body.answer}\nSources: ${JSON.stringify(body.sources)}\n`);
    if (index < 3) {
      expect(body.answer).not.toBe(missing);
      expect(body.sources.length).toBeGreaterThan(0);
      for (const source of body.sources) {
        expect(new URL(source.url).hostname).toMatch(/(?:^|\.)(?:gov|nic)\.in$/);
        await expect(page.getByRole('link', { name: `${source.title} (opens in a new tab)`, exact: true })).toHaveAttribute('href', source.url);
      }
    } else {
      expect(body.answer).toBe(missing);
      expect(body.sources).toEqual([]);
      await expect(page.getByRole('heading', { name: 'Official pages used' })).toHaveCount(0);
    }
  }
  expect(errors).toEqual([]);
  expect(providerRequests).toEqual([]);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: '15 of 20' })).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: '.verification/bharat-desktop.png', fullPage: true });
});

test('twenty concurrent questions are allowed, the twenty-first is blocked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: '20 of 20' })).toBeVisible();
  const responses = await Promise.all(Array.from({ length: 21 }, () => page.request.post('/api/ask', {
    data: { question: 'zxyqvblorptasticnonword' },
  })));
  expect(responses.filter((response) => response.status() === 200)).toHaveLength(20);
  expect(responses.filter((response) => response.status() === 429)).toHaveLength(1);
  for (const response of responses.filter((response) => response.status() === 200)) {
    const body = await response.json();
    expect(body.answer).toBe(missing);
    expect(body.sources).toEqual([]);
  }
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'You have used your 20 questions' })).toBeVisible();
  await page.getByLabel('What would you like to know?').fill('Help for farmers');
  await expect(page.getByRole('button', { name: 'Find an answer', exact: true })).toBeDisabled();
});
