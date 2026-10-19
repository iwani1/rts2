import { expect, test } from '@playwright/test';

function csv(headers: string[], fields: Record<string, string>) {
  return [headers.join(','), headers.map((header) => fields[header] ?? '').join(',')].join('\r\n');
}

test('authorized staff can import records, review vehicle document dates, edit customer history, link a usual driver, and verify persistence', async ({ page }) => {
  const email = process.env.TMS_E2E_EMAIL;
  const password = process.env.TMS_E2E_PASSWORD;
  if (!email || !password) throw new Error('Set TMS_E2E_EMAIL and TMS_E2E_PASSWORD in the local environment.');
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.goto('/customers/import');
  const customerHeaders = ['displayName', 'reference', 'contactPerson', 'telephone', 'email', 'billingDetails', 'customerType', 'status', 'notes'];
  const invalidCustomerCsv = csv(customerHeaders, { reference: `E2E-invalid-${suffix}` });
  await page.getByLabel('Customer CSV file').setInputFiles({ name: 'invalid-customers.csv', mimeType: 'text/csv', buffer: Buffer.from(invalidCustomerCsv) });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText(/All-or-nothing import/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Import/ })).toHaveCount(0);
  await page.goto(`/customers?q=${encodeURIComponent(`E2E-invalid-${suffix}`)}`);
  await expect(page.getByRole('heading', { name: 'No customers found' })).toBeVisible();
  await page.goto('/customers/import');

  const customerCsv = csv(
    customerHeaders,
    { displayName: `E2E CSV Customer ${suffix}`, reference: `E2E-${suffix}` },
  );
  await page.getByLabel('Customer CSV file').setInputFiles({ name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(customerCsv) });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText(`E2E CSV Customer ${suffix}`)).toBeVisible();
  await page.getByLabel('Reason for this import').fill('Import verified browser-test customer');
  await page.getByRole('button', { name: 'Import 1 customer' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 customer record imported.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Imported customer records' })).toBeVisible();
  await expect(page.getByLabel('Customer CSV file')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Preview CSV' })).toBeDisabled();
  await page.goto('/customers');
  await expect(page.getByRole('table', { name: 'Customer register records' })).toBeVisible();
  const importedCustomer = page.getByRole('row').filter({ hasText: `E2E CSV Customer ${suffix}` });
  await importedCustomer.getByRole('link', { name: 'Edit / history' }).click();
  await expect(page.getByRole('heading', { name: 'Customer history' })).toBeVisible();
  await expect(page.getByText('Import verified browser-test customer')).toBeVisible();
  await page.getByLabel('Notes').fill('Updated in the browser test');
  await page.getByLabel('Reason for change').fill('Verified customer edit through browser');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Customer record saved.' })).toBeVisible();
  await expect(page.getByText('Verified customer edit through browser')).toBeVisible();
  await page.getByText('Archive this customer').click();
  await page.getByLabel('Reason for archiving').fill('Archive disposable browser-test customer');
  await page.getByRole('button', { name: 'Archive customer' }).click();
  await expect(page).toHaveURL('/customers');
  await expect(page.getByRole('row').filter({ hasText: `E2E CSV Customer ${suffix}` })).toHaveCount(0);

  await page.goto('/fleet/vehicles/import');
  const vehicleCsv = csv(
    ['registrationNumber', 'make', 'model', 'category', 'seatCount', 'fuelType', 'ownershipType', 'odometerValue', 'odometerUnit', 'insuranceExpiresAt', 'roadworthinessExpiresAt', 'registrationExpiresAt', 'nextServiceAt', 'notes'],
    {
      registrationNumber: `E2E-${suffix}`, make: 'Test make', model: 'Test model', category: 'Browser-test category',
      insuranceExpiresAt: '2027-07-01', roadworthinessExpiresAt: '2026-12-30', registrationExpiresAt: '2027-01-15',
    },
  );
  await page.getByLabel('Vehicle CSV file').setInputFiles({ name: 'vehicles.csv', mimeType: 'text/csv', buffer: Buffer.from(vehicleCsv) });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText(`E2E-${suffix}`)).toBeVisible();
  await page.getByLabel('Reason for this import').fill('Import verified browser-test vehicle');
  await page.getByRole('button', { name: 'Import 1 vehicle' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 vehicle record imported.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Imported vehicle records' })).toBeVisible();
  await expect(page.getByLabel('Vehicle CSV file')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Preview CSV' })).toBeDisabled();

  await page.goto('/fleet/vehicles');
  await page.getByRole('link', { name: 'Document dates' }).click();
  await expect(page).toHaveURL('/fleet/vehicles/documents');
  await expect(page.getByRole('heading', { name: 'Vehicle document dates' })).toBeVisible();
  const vehicleDocumentRows = page.getByRole('row').filter({ hasText: `E2E-${suffix}` });
  await expect(vehicleDocumentRows).toHaveCount(3);
  await expect(vehicleDocumentRows.filter({ hasText: 'Roadworthiness' })).toContainText('2026-12-30');
  await expect(vehicleDocumentRows.filter({ hasText: 'Vehicle Registration' })).toContainText('2027-01-15');
  await expect(vehicleDocumentRows.filter({ hasText: 'Insurance' })).toContainText('2027-07-01');
  await page.getByLabel('Document type').selectOption('Insurance');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('row').filter({ hasText: `E2E-${suffix}` })).toHaveCount(1);

  await page.goto('/fleet/drivers/import');
  const driverCsv = csv(
    ['fullName', 'licenceClass', 'licenceExpiresAt', 'qualifications', 'availability', 'status'],
    { fullName: `E2E CSV Driver ${suffix}` },
  );
  await page.getByLabel('Driver CSV file').setInputFiles({ name: 'drivers.csv', mimeType: 'text/csv', buffer: Buffer.from(driverCsv) });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText(`E2E CSV Driver ${suffix}`)).toBeVisible();
  await page.getByLabel('Reason for this import').fill('Import verified browser-test driver');
  await page.getByRole('button', { name: 'Import 1 driver' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 driver record imported.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Imported driver records' })).toBeVisible();
  await expect(page.getByLabel('Driver CSV file')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Preview CSV' })).toBeDisabled();
  await page.goto('/fleet/drivers');
  await expect(page.getByRole('table', { name: 'Driver register records' })).toBeVisible();

  await page.goto('/fleet/vehicles');
  await expect(page.getByRole('table', { name: 'Vehicle register records' })).toBeVisible();
  const importedVehicle = page.getByRole('row').filter({ hasText: `E2E-${suffix}` });
  await importedVehicle.getByRole('link', { name: 'Edit' }).click();
  const driverName = `E2E CSV Driver ${suffix}`;
  await page.getByLabel('Search active drivers').fill(driverName);
  const driverOption = page.getByRole('button', { name: new RegExp(driverName) });
  await expect(driverOption).toBeVisible();
  await driverOption.click();
  await page.getByLabel('Reason for change').fill('Link verified usual driver in browser test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Vehicle record saved.' })).toBeVisible();
  await expect(importedVehicle.getByText(driverName)).toBeVisible();

  // Same-name match against the existing company driver is advisory, not an import blocker.
  await page.goto('/fleet/drivers/import');
  const repeatedDriverCsv = csv(
    ['fullName', 'licenceClass', 'licenceExpiresAt', 'qualifications', 'availability', 'status'],
    { fullName: driverName },
  );
  await page.getByLabel('Driver CSV file').setInputFiles({ name: 'same-name-driver.csv', mimeType: 'text/csv', buffer: Buffer.from(repeatedDriverCsv) });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText(/Possible name match in an existing company driver record/)).toBeVisible();
  await page.getByLabel('Reason for this import').fill('Import reviewed same-name browser-test driver');
  await page.getByRole('button', { name: 'Import 1 driver' }).click();
  await expect(page.getByRole('status').filter({ hasText: '1 driver record imported.' })).toBeVisible();

  // Repeated names inside one CSV also warn, but both valid rows are imported separately.
  await page.goto('/fleet/drivers/import');
  const repeatedRowsCsv = [
    'fullName,licenceClass,licenceExpiresAt,qualifications,availability,status',
    `${driverName},,,,,`,
    `${driverName},,,,,`,
  ].join('\r\n');
  await page.getByLabel('Driver CSV file').setInputFiles({ name: 'same-name-rows.csv', mimeType: 'text/csv', buffer: Buffer.from(repeatedRowsCsv) });
  await page.getByRole('button', { name: 'Preview CSV' }).click();
  await expect(page.getByText(/Possible name match in another row in this CSV/)).toHaveCount(2);
  await page.getByLabel('Reason for this import').fill('Import reviewed same-name rows from browser test');
  await page.getByRole('button', { name: 'Import all 2 drivers' }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 driver records imported.' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/fleet/vehicles');
  await expect(page.getByRole('row').filter({ hasText: `E2E-${suffix}` }).getByText(driverName)).toBeVisible();
});
