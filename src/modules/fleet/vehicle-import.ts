import { vehicleInputSchema, normalizeVehicleRegistrationNumber, type VehicleInput } from './vehicle-schema';
import { MAX_IMPORT_CSV_ROWS } from '@/modules/imports/csv-constants';
import { parseFixedCsv } from '@/modules/imports/fixed-csv';
import { vehicleImportHeaders, type VehicleImportFields } from './vehicle-import-constants';

export { vehicleImportHeaders } from './vehicle-import-constants';

export type VehicleImportRow = {
  rowNumber: number;
  values: VehicleImportFields;
  registrationNumber: string;
  make: string;
  model: string;
  category: string;
  errors: string[];
  data?: VehicleInput;
};

export function parseVehicleImportCsv(csv: string): { rows: VehicleImportRow[]; fileErrors: string[] } {
  const parsed = parseFixedCsv(csv, vehicleImportHeaders, ['registrationNumber', 'make', 'model', 'category']);
  if (parsed.fileErrors.length > 0) return { rows: [], fileErrors: parsed.fileErrors };
  if (parsed.rows.length > MAX_IMPORT_CSV_ROWS) {
    return { rows: [], fileErrors: [`The CSV exceeds the technical limit of ${MAX_IMPORT_CSV_ROWS} vehicle rows per batch.`] };
  }

  const rows: VehicleImportRow[] = parsed.rows.map(({ rowNumber, values, errors }) => {
    const rowValues = Object.fromEntries(vehicleImportHeaders.map((field) => [field, values[field] ?? ''])) as VehicleImportFields;
    const registrationNumber = normalizeVehicleRegistrationNumber(rowValues.registrationNumber);
    if (errors.length > 0) return {
      rowNumber, values: rowValues, registrationNumber, make: rowValues.make, model: rowValues.model, category: rowValues.category, errors,
    };

    const numberOrNull = (field: keyof VehicleImportFields) => {
      const value = rowValues[field] ?? '';
      return value === '' ? null : Number(value);
    };
    const candidate = {
      registrationNumber,
      make: rowValues.make,
      model: rowValues.model,
      category: rowValues.category,
      seatCount: numberOrNull('seatCount'),
      fuelType: rowValues.fuelType || null,
      ownershipType: rowValues.ownershipType || null,
      odometerValue: numberOrNull('odometerValue'),
      odometerUnit: rowValues.odometerUnit || null,
      insuranceExpiresAt: rowValues.insuranceExpiresAt || null,
      roadworthinessExpiresAt: rowValues.roadworthinessExpiresAt || null,
      registrationExpiresAt: rowValues.registrationExpiresAt || null,
      nextServiceAt: rowValues.nextServiceAt || null,
      notes: rowValues.notes || null,
    };
    const validated = vehicleInputSchema.safeParse(candidate);
    if (!validated.success) return {
      rowNumber, values: rowValues, registrationNumber, make: rowValues.make, model: rowValues.model, category: rowValues.category,
      errors: validated.error.issues.map((issue) => `${String(issue.path[0] ?? 'row')}: ${issue.message}`),
    };
    return {
      rowNumber,
      values: rowValues,
      registrationNumber: validated.data.registrationNumber,
      make: validated.data.make,
      model: validated.data.model,
      category: validated.data.category,
      errors: [],
      data: validated.data,
    };
  });

  const rowsByRegistration = new Map<string, VehicleImportRow[]>();
  for (const row of rows) {
    if (!row.data?.registrationNumber) continue;
    const matches = rowsByRegistration.get(row.data.registrationNumber) ?? [];
    matches.push(row);
    rowsByRegistration.set(row.data.registrationNumber, matches);
  }
  for (const [registration, matches] of rowsByRegistration) {
    if (matches.length < 2) continue;
    const rowNumbers = matches.map((row) => row.rowNumber).join(', ');
    for (const row of matches) row.errors.push(`Registration ${registration} is repeated in rows ${rowNumbers}.`);
  }

  return { rows, fileErrors: [] };
}
