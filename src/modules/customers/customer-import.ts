import { customerInputSchema } from './customer-schema';
import { customerImportHeaders, MAX_CUSTOMER_IMPORT_ROWS } from './customer-import-constants';
import { parseFixedCsv } from '@/modules/imports/fixed-csv';

export { customerImportHeaders, MAX_CUSTOMER_IMPORT_BYTES, MAX_CUSTOMER_IMPORT_ROWS } from './customer-import-constants';

export type CustomerImportInput = ReturnType<typeof customerInputSchema.parse>;
export type CustomerImportRow = {
  rowNumber: number;
  displayName: string;
  reference: string | null;
  contactPerson: string | null;
  telephone: string | null;
  email: string | null;
  billingDetails: string | null;
  customerType: string | null;
  status: string | null;
  notes: string | null;
  errors: string[];
  data?: CustomerImportInput;
};

export type ParsedCustomerImport = {
  rows: CustomerImportRow[];
  fileErrors: string[];
};

export function parseCustomerImportCsv(csv: string): ParsedCustomerImport {
  const parsed = parseFixedCsv(csv, customerImportHeaders, ['displayName']);
  if (parsed.fileErrors.length > 0) return { rows: [], fileErrors: parsed.fileErrors };
  if (parsed.rows.length === 0) return { rows: [], fileErrors: ['The CSV contains a header but no customer rows.'] };
  if (parsed.rows.length > MAX_CUSTOMER_IMPORT_ROWS) {
    return { rows: [], fileErrors: [`The CSV exceeds the technical limit of ${MAX_CUSTOMER_IMPORT_ROWS} customer rows per batch.`] };
  }

  const rows: CustomerImportRow[] = parsed.rows.map(({ rowNumber, values, errors }) => {
    const fields = {
      displayName: values.displayName ?? '',
      reference: values.reference || null,
      contactPerson: values.contactPerson || null,
      telephone: values.telephone || null,
      email: values.email || null,
      billingDetails: values.billingDetails || null,
      customerType: values.customerType || null,
      status: values.status || null,
      notes: values.notes || null,
    };
    if (errors.length > 0) return { rowNumber, ...fields, errors };
    const candidate = Object.fromEntries(customerImportHeaders.map((field) => {
      const value = values[field] ?? '';
      return [field, field === 'displayName' ? value : value || null];
    }));
    const validated = customerInputSchema.safeParse(candidate);
    if (!validated.success) return {
      rowNumber,
      ...fields,
      errors: validated.error.issues.map((issue) => `${String(issue.path[0] ?? 'row')}: ${issue.message}`),
    };
    return { rowNumber, ...validated.data, errors: [], data: validated.data };
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
