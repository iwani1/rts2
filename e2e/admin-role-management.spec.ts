import { expect, test } from '@playwright/test';

test('Super Administrator can review read-only policy status and cannot change their own roles', async ({ page }) => {
  const email = process.env.TMS_E2E_EMAIL;
  const password = process.env.TMS_E2E_PASSWORD;
  if (!email || !password) throw new Error('Set TMS_E2E_EMAIL and TMS_E2E_PASSWORD in the local environment.');

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  const settingsResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/admin/companies/') && response.url().endsWith('/settings') && response.request().method() === 'GET');
  await page.getByRole('link', { name: 'Policy settings' }).click();
  await expect(page.getByRole('heading', { name: 'Policy settings status' })).toBeVisible();
  const settingsResponse = await settingsResponsePromise;
  expect(settingsResponse.status()).toBe(200);
  expect(JSON.stringify(await settingsResponse.json())).not.toContain('"value":');
  await expect(page.getByRole('table', { name: 'Registered policy keys, configuration status and blocked features' })).toBeVisible();
  await expect(page.locator('input, textarea, select')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Save|Update/ })).toHaveCount(0);
  const pricingRow = page.getByRole('row').filter({ hasText: 'Rental pricing models' });
  await expect(pricingRow).toContainText('Not configured');
  await expect(pricingRow).toContainText('RNT-04');

  await page.goto('/');
  await page.getByRole('link', { name: 'User roles' }).click();
  await page.getByLabel('Search users by name or email').fill(email);
  await page.getByRole('button', { name: 'Search' }).click();
  const account = page.getByRole('row').filter({ hasText: email });
  await expect(account).toBeVisible();
  await account.getByRole('link', { name: 'Manage roles' }).click();
  await expect(page.getByRole('heading', { name: 'Assign a role' })).toBeVisible();
  await expect(page.getByText(/You cannot change your own roles/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assign role' })).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Active role assignments' })).toBeVisible();
});
