import { employeeInputSchema } from './employee-schema';
import { employeeImportHeaders, MAX_EMPLOYEE_IMPORT_ROWS } from './employee-import-constants';
import { parseFixedCsv } from '@/modules/imports/fixed-csv';

export { employeeImportHeaders, MAX_EMPLOYEE_IMPORT_BYTES, MAX_EMPLOYEE_IMPORT_ROWS } from './employee-import-constants';

export type EmployeeImportInput = ReturnType<typeof employeeInputSchema.parse>;
export type EmployeeImportRow = {
  rowNumber: number;
  reference: string | null;
  fullName: string;
  telephone: string | null;
  email: string | null;
  department: string | null;
  errors: string[];
  warnings: string[];
  data?: EmployeeImportInput;
};

export type ParsedEmployeeImport = {
  rows: EmployeeImportRow[];
  fileErrors: string[];
};

function normalizedName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function contactKey(telephone: string | null, email: string | null) {
  const digits = (telephone ?? '').replace(/\D/g, '');
  if (digits) return `tel:${digits}`;
  const mail = (email ?? '').trim().toLowerCase();
  return mail ? `email:${mail}` : '';
}

/** Key used only to warn about likely duplicates; it never blocks or merges a row. */
export function employeeLikelyDuplicateKey(fullName: string, telephone: string | null, email: string | null) {
  const contact = contactKey(telephone, email);
  return contact ? `${normalizedName(fullName)}|${contact}` : '';
}

export function parseEmployeeImportCsv(csv: string, clientId: string): ParsedEmployeeImport {
  const parsed = parseFixedCsv(csv, employeeImportHeaders, ['fullName']);
  if (parsed.fileErrors.length > 0) return { rows: [], fileErrors: parsed.fileErrors };
  if (parsed.rows.length === 0) return { rows: [], fileErrors: ['The CSV contains a header but no employee rows.'] };
  if (parsed.rows.length > MAX_EMPLOYEE_IMPORT_ROWS) {
    return { rows: [], fileErrors: [`The CSV exceeds the technical limit of ${MAX_EMPLOYEE_IMPORT_ROWS} employee rows per batch.`] };
  }

  const rows: EmployeeImportRow[] = parsed.rows.map(({ rowNumber, values, errors }) => {
    const base = {
      rowNumber,
      reference: values.reference || null,
      fullName: values.fullName ?? '',
      telephone: values.telephone || null,
      email: values.email || null,
      department: values.department || null,
      warnings: [] as string[],
    };
    if (errors.length > 0) return { ...base, errors };
    const eligibilityRaw = (values.transportEligible ?? '').trim().toUpperCase();
    if (!['', 'TRUE', 'FALSE'].includes(eligibilityRaw)) {
      return { ...base, errors: ['transportEligible: Enter TRUE, FALSE, or leave the cell blank when eligibility is not yet recorded.'] };
    }
    const candidate = {
      clientId,
      reference: values.reference || null,
      fullName: values.fullName ?? '',
      telephone: values.telephone || null,
      email: values.email || null,
      homeAddress: values.homeAddress || null,
      department: values.department || null,
      workLocation: values.workLocation || null,
      shift: values.shift || null,
      approvedPickupLocation: values.approvedPickupLocation || null,
      approvedDropoffLocation: values.approvedDropoffLocation || null,
      accountStatus: values.accountStatus || null,
      transportEligible: eligibilityRaw === '' ? null : eligibilityRaw === 'TRUE',
      accessibilityNeeds: values.accessibilityNeeds || null,
      notes: values.notes || null,
    };
    const validated = employeeInputSchema.safeParse(candidate);
    if (!validated.success) {
      return {
        ...base,
        errors: validated.error.issues.map((issue) => `${String(issue.path[0] ?? 'row')}: ${issue.message}`),
      };
    }
    return { ...base, errors: [], data: validated.data };
  });

  const rowsByReference = new Map<string, EmployeeImportRow[]>();
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

  const rowsByLikelyDuplicate = new Map<string, EmployeeImportRow[]>();
  for (const row of rows) {
    if (!row.data) continue;
    const key = employeeLikelyDuplicateKey(row.data.fullName, row.data.telephone, row.data.email);
    if (!key) continue;
    const matches = rowsByLikelyDuplicate.get(key) ?? [];
    matches.push(row);
    rowsByLikelyDuplicate.set(key, matches);
  }
  for (const matches of rowsByLikelyDuplicate.values()) {
    if (matches.length < 2) continue;
    const rowNumbers = matches.map((row) => row.rowNumber).join(', ');
    for (const row of matches) {
      row.warnings.push(`Possible duplicate within this file (same name and contact in rows ${rowNumbers}). Rows are never merged automatically; check before importing.`);
    }
  }

  return { rows, fileErrors: [] };
}
