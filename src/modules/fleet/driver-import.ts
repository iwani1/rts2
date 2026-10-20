import { MAX_IMPORT_CSV_ROWS } from '@/modules/imports/csv-constants';
import { parseFixedCsv } from '@/modules/imports/fixed-csv';
import { driverInputSchema, type DriverInput } from './driver-schema';
import { driverImportHeaders } from './driver-import-constants';

export { driverImportHeaders } from './driver-import-constants';

export type DriverImportRow = {
  rowNumber: number;
  fullName: string;
  licenceClass: string;
  licenceExpiresAt: string;
  qualifications: string;
  availability: string;
  status: string;
  errors: string[];
  data?: DriverInput;
};

function normalizeDriverName(name: string) {
  return name.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function createDriverImportNameWarnings(csvNames: readonly string[], existingNames: readonly string[]) {
  const csvNameCounts = new Map<string, number>();
  for (const name of csvNames) {
    const key = normalizeDriverName(name);
    if (key) csvNameCounts.set(key, (csvNameCounts.get(key) ?? 0) + 1);
  }
  const existingNameKeys = new Set(existingNames.map(normalizeDriverName));
  return (fullName: string) => {
    const key = normalizeDriverName(fullName);
    return [
      ...((csvNameCounts.get(key) ?? 0) > 1
        ? ['Possible name match in another row in this CSV. This is advisory only; every valid row remains a separate record.']
        : []),
      ...(existingNameKeys.has(key)
        ? ['Possible name match in an existing company driver record. This is advisory only; no record will be merged or updated.']
        : []),
    ];
  };
}

export function parseDriverImportCsv(csv: string): { rows: DriverImportRow[]; fileErrors: string[] } {
  const parsed = parseFixedCsv(csv, driverImportHeaders, ['fullName']);
  if (parsed.fileErrors.length > 0) return { rows: [], fileErrors: parsed.fileErrors };
  if (parsed.rows.length > MAX_IMPORT_CSV_ROWS) {
    return { rows: [], fileErrors: [`The CSV exceeds the technical limit of ${MAX_IMPORT_CSV_ROWS} driver rows per batch.`] };
  }

  const rows: DriverImportRow[] = parsed.rows.map(({ rowNumber, values, errors }) => {
    const fields = {
      fullName: values.fullName ?? '',
      licenceClass: values.licenceClass ?? '',
      licenceExpiresAt: values.licenceExpiresAt ?? '',
      qualifications: values.qualifications ?? '',
      availability: values.availability ?? '',
      status: values.status ?? '',
    };
    if (errors.length > 0) return { rowNumber, ...fields, errors };
    const candidate = {
      fullName: fields.fullName,
      licenceClass: fields.licenceClass || null,
      licenceExpiresAt: fields.licenceExpiresAt || null,
      qualifications: fields.qualifications || null,
      availability: fields.availability || null,
      status: fields.status || null,
    };
    const validated = driverInputSchema.safeParse(candidate);
    if (!validated.success) return {
      rowNumber,
      ...fields,
      errors: validated.error.issues.map((issue) => `${String(issue.path[0] ?? 'row')}: ${issue.message}`),
    };
    return { rowNumber, ...fields, fullName: validated.data.fullName, errors: [], data: validated.data };
  });
  return { rows, fileErrors: [] };
}
