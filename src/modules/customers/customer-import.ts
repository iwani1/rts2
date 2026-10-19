import { parse } from 'csv-parse/sync';
import { customerImportHeaders, MAX_CUSTOMER_IMPORT_BYTES, MAX_CUSTOMER_IMPORT_ROWS } from './customer-import-constants';
import { customerInputSchema } from './customer-schema';

export { customerImportHeaders, MAX_CUSTOMER_IMPORT_BYTES, MAX_CUSTOMER_IMPORT_ROWS } from './customer-import-constants';

export type CustomerImportInput = ReturnType<typeof customerInputSchema.parse>;
export type CustomerImportRow = {
  rowNumber: number;
  displayName: string;
  reference: string | null;
  errors: string[];
  data?: CustomerImportInput;
};

export type ParsedCustomerImport = {
  rows: CustomerImportRow[];
  fileErrors: string[];
};

export function parseCustomerImportCsv(csv: string): ParsedCustomerImport {
  if (Buffer.byteLength(csv, 'utf8') > MAX_CUSTOMER_IMPORT_BYTES) {
    return { rows: [], fileErrors: [`CSV exceeds the technical limit of ${MAX_CUSTOMER_IMPORT_BYTES} bytes.`] };
  }

  let records: string[][];
  try {
    records = parse(csv, {
      bom: true,
      columns: false,
      relax_column_count: true,
      skip_empty_lines: false,
      trim: false,
    }) as string[][];
  } catch {
    return { rows: [], fileErrors: ['CSV syntax is invalid. Check the delimiter and quoted fields.'] };
  }

  if (records.length === 0) return { rows: [], fileErrors: ['The CSV file is empty.'] };
  const headers = records[0].map((header) => header.trim());
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  const unknownHeaders = headers.filter((header) => !customerImportHeaders.includes(header as typeof customerImportHeaders[number]));
  const fileErrors: string[] = [];
  if (duplicateHeaders.length > 0) fileErrors.push(`Duplicate column headers: ${[...new Set(duplicateHeaders)].join(', ')}.`);
  if (unknownHeaders.length > 0) fileErrors.push(`Unsupported column headers: ${[...new Set(unknownHeaders)].join(', ')}.`);
  if (!headers.includes('displayName')) fileErrors.push('The required displayName column is missing.');
  if (fileErrors.length > 0) return { rows: [], fileErrors };

  const rawRows = records.slice(1);
  if (rawRows.length === 0) return { rows: [], fileErrors: ['The CSV contains a header but no customer rows.'] };
  if (rawRows.length > MAX_CUSTOMER_IMPORT_ROWS) {
    return { rows: [], fileErrors: [`The CSV exceeds the technical limit of ${MAX_CUSTOMER_IMPORT_ROWS} customer rows per batch.`] };
  }

  const rows: CustomerImportRow[] = rawRows.map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== headers.length) {
      return {
        rowNumber,
        displayName: '',
        reference: null,
        errors: [`Expected ${headers.length} columns but found ${values.length}.`],
      };
    }

    const raw = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? '']));
    const candidate = Object.fromEntries(customerImportHeaders.map((field) => {
      const value = raw[field] ?? '';
      return [field, field === 'displayName' ? value : value || null];
    }));
    const parsed = customerInputSchema.safeParse(candidate);
    if (!parsed.success) {
      return {
        rowNumber,
        displayName: typeof candidate.displayName === 'string' ? candidate.displayName : '',
        reference: typeof candidate.reference === 'string' ? candidate.reference : null,
        errors: parsed.error.issues.map((issue) => `${String(issue.path[0] ?? 'row')}: ${issue.message}`),
      };
    }
    return {
      rowNumber,
      displayName: parsed.data.displayName,
      reference: parsed.data.reference,
      errors: [],
      data: parsed.data,
    };
  });

  const rowsByReference = new Map<string, CustomerImportRow[]>();
  for (const row of rows) {
    if (!row.data?.reference) continue;
    const matches = rowsByReference.get(row.data.reference) ?? [];
    matches.push(row);
    rowsByReference.set(row.data.reference, matches);
  }
  for (const [reference, matches] of rowsByReference) {
    if (matches.length < 2) continue;
    const rowNumbers = matches.map((row) => row.rowNumber).join(', ');
    for (const row of matches) row.errors.push(`Reference "${reference}" is repeated in rows ${rowNumbers}.`);
  }

  return { rows, fileErrors: [] };
}
