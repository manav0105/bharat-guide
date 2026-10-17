import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

// Existing answer/20-question tests now exercise the signed-in path. Credentials
// stay in memory and never enter logs, screenshots, or saved browser state.
export async function createTestAccount(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign up', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(`bharat-e2e-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill(randomBytes(24).toString('base64url'));
  await page.getByRole('button', { name: 'Sign up free', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeVisible();
}
