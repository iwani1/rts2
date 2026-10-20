import { expect, test } from '@playwright/test';

function localDateTime(value: Date) {
  const pad = (part: number, width = 2) => String(part).padStart(width, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}.${pad(value.getMilliseconds(), 3)}`;
}

test('authorized fleet manager applies and releases a safety block, then records and searches non-safety maintenance', async ({ page }) => {
  const email = process.env.TMS_E2E_EMAIL;
  const password = process.env.TMS_E2E_PASSWORD;
  if (!email || !password) throw new Error('Set TMS_E2E_EMAIL and TMS_E2E_PASSWORD in the local environment.');
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const registration = `SB-${suffix}`;

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/fleet/vehicles');
  await page.getByLabel('Registration number').fill(registration);
  await page.getByLabel('Make', { exact: true }).fill('E2E test');
  await page.getByLabel('Model', { exact: true }).fill(`Safety ${suffix}`);
  await page.getByLabel('Vehicle category').fill('E2E test vehicle');
  await page.getByLabel('Reason for creation').fill('Create a disposable vehicle for safety-block E2E');
  await page.getByRole('button', { name: 'Add vehicle' }).click();
  await expect(page.getByText('Vehicle record saved.')).toBeVisible();

  const vehicleRow = page.getByRole('row').filter({ hasText: registration });
  await expect(vehicleRow).toBeVisible();
  await vehicleRow.getByRole('button', { name: 'Apply safety block' }).click();
  await vehicleRow.getByLabel('Safety status').selectOption('Out of Service');
  await vehicleRow.getByLabel('Reason for immediate block').fill('E2E test records immediate safety restriction');
  await vehicleRow.getByRole('button', { name: 'Apply safety block' }).click();
  await expect(vehicleRow).toContainText('Blocked — Out of Service');
  await expect(vehicleRow).toContainText('E2E test records immediate safety restriction');

  await vehicleRow.getByRole('button', { name: 'Record inspection and release' }).click();
  await vehicleRow.getByLabel('Work completed at').fill(localDateTime(new Date()));
  await vehicleRow.getByLabel('Inspection results').fill('E2E brake and steering inspection passed after repair');
  await vehicleRow.getByLabel('I confirm the inspection passed and this vehicle is safe to return to service.').check();
  await vehicleRow.getByLabel('Release reason').fill('E2E release after completed work and passed inspection');
  await vehicleRow.getByRole('button', { name: 'Record inspection and release' }).click();
  await expect(vehicleRow).toContainText('No active safety block recorded');

  await page.goto('/fleet/maintenance');
  await page.getByLabel('Vehicle').selectOption({ label: `${registration} — E2E test Safety ${suffix}` });
  await page.getByLabel('Date reported').fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel('Reported fault').fill('E2E non-safety door hinge inspection');
  await page.getByLabel('Reason for creating this work order').fill('Record an E2E non-safety maintenance report');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Record work order' }).click();
  await expect(page.getByRole('status')).toContainText('recorded as Reported');

  await page.getByLabel('Search reference, fault or registration').fill(registration);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('row').filter({ hasText: registration })).toContainText('E2E non-safety door hinge inspection');
});
