import { expect, test } from '@playwright/test';

function upcomingDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test('authorized staff can submit a rental request, review it, then record a reasoned decline', async ({ page }) => {
  const email = process.env.TMS_E2E_EMAIL;
  const password = process.env.TMS_E2E_PASSWORD;
  if (!email || !password) throw new Error('Set TMS_E2E_EMAIL and TMS_E2E_PASSWORD in the local environment.');

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const customerName = `E2E customer ${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: 'Customer register' }).click();
  await page.getByLabel('Customer or organisation name').fill(customerName);
  await page.getByLabel('Reason for creation').fill('Create a disposable browser-test customer');
  const customerCreateResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/customers') && response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: 'Add customer' }).click();
  const customerCreateResponse = await customerCreateResponsePromise;
  expect(customerCreateResponse.status()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'Customer record saved.' })).toBeVisible();

  await page.goto('/rentals/requests');
  await page.getByLabel('Search existing customers').fill(customerName);
  await page.getByRole('button', { name: new RegExp(customerName) }).click();
  await page.getByLabel('Request source').selectOption('PHONE');
  await page.getByLabel('Reason for recording or updating this Draft').fill('Capture a phone enquiry for browser test');
  await page.getByRole('button', { name: 'Save Draft' }).click();
  await expect(page.getByText('Rental request saved as Draft.')).toBeVisible();

  await expect(page.getByRole('table', { name: 'Rental request records' })).toBeVisible();
  const requestRow = page.getByRole('row').filter({ hasText: customerName });
  await expect(requestRow).toContainText('Draft');
  await requestRow.getByRole('link', { name: 'View / edit' }).click();
  await page.getByLabel('Reason for recording or updating this Draft').fill('Prepare this Draft for submission');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByRole('alert')).toContainText('Draft saved but not submitted');
  await expect(page.getByRole('alert')).toContainText('service date');
  await expect(page.getByRole('alert')).toContainText('return time or duration');

  await page.getByLabel('Service date').fill(upcomingDate(14));
  await page.getByLabel('Departure time').fill('22:30');
  await page.getByLabel('Return time').fill('01:30');
  await page.getByLabel('Return date (for overnight trips)').fill(upcomingDate(15));
  await page.getByLabel('Pickup location').fill('Accra');
  await page.getByLabel('Destination').fill('Kumasi');
  await page.getByLabel('Passenger count').fill('12');
  await page.getByLabel('Request source').selectOption('PHONE');
  await page.getByLabel('Reason for recording or updating this Draft').fill('Required details checked before submission');
  await page.getByRole('button', { name: 'Submit request' }).click();

  await expect(page.getByRole('heading', { name: 'Request details' })).toBeVisible();
  await expect(page.getByText(upcomingDate(15)).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Status history' })).toBeVisible();
  await expect(page.getByText('Draft → Submitted')).toBeVisible();
  await expect(requestRow).toContainText('Submitted');
  await expect(requestRow).toContainText(upcomingDate(15));
  await expect(page.getByRole('button', { name: 'Submit request' })).toHaveCount(0);

  await page.getByLabel('Reason for this status change').fill('Ops manager begins rental review');
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText('Submitted → Under Review')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quotation is not available yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Decline request' })).toBeVisible();

  await page.getByLabel('Reason for this status change').fill('Unable to meet customer requirements');
  await page.getByRole('button', { name: 'Decline request' }).click();
  await expect(page.getByText('Under Review → Declined')).toBeVisible();
  await expect(requestRow).toContainText('Declined');
  await expect(page.getByText(/Only the explicitly approved review and decline transitions are currently available/)).toBeVisible();

  await page.getByLabel('Search requests').fill(customerName);
  await page.getByLabel('Filter by status').selectOption('Declined');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/status=Declined/);
  await expect(page.getByRole('table', { name: 'Rental request records' }).getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('table', { name: 'Rental request records' })).toContainText(customerName);

  await page.goto('/rentals/reports');
  await expect(page.getByRole('heading', { name: 'Rental request report' })).toBeVisible();
  await expect(page.getByText(/Requests ever submitted:/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Metrics not available yet' })).toBeVisible();
  await expect(page.getByText(/Quotations issued and acceptance rate/)).toBeVisible();
});
