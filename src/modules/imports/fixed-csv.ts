import { parse } from 'csv-parse/sync';
import { MAX_IMPORT_CSV_BYTES, MAX_IMPORT_CSV_ROWS } from './csv-constants';

export type FixedCsvRow = {
  rowNumber: number;
  values: Record<string, string>;
  errors: string[];
};

export type FixedCsvParseResult = {
  rows: FixedCsvRow[];
  fileErrors: string[];
};

export function parseFixedCsv(
  csv: string,
  allowedHeaders: readonly string[],
  requiredHeaders: readonly string[],
): FixedCsvParseResult {
  if (Buffer.byteLength(csv, 'utf8') > MAX_IMPORT_CSV_BYTES) {
    return { rows: [], fileErrors: [`CSV exceeds the technical limit of ${MAX_IMPORT_CSV_BYTES} bytes.`] };
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
  const unknownHeaders = headers.filter((header) => !allowedHeaders.includes(header));
  const fileErrors: string[] = [];
  if (duplicateHeaders.length > 0) fileErrors.push(`Duplicate column headers: ${[...new Set(duplicateHeaders)].join(', ')}.`);
  if (unknownHeaders.length > 0) fileErrors.push(`Unsupported column headers: ${[...new Set(unknownHeaders)].join(', ')}.`);
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) fileErrors.push(`Required column header(s) missing: ${missingHeaders.join(', ')}.`);
  if (fileErrors.length > 0) return { rows: [], fileErrors };

  const rawRows = records.slice(1);
  if (rawRows.length === 0) return { rows: [], fileErrors: ['The CSV contains a header but no data rows.'] };
  if (rawRows.length > MAX_IMPORT_CSV_ROWS) {
    return { rows: [], fileErrors: [`The CSV exceeds the technical limit of ${MAX_IMPORT_CSV_ROWS} data rows per batch.`] };
  }

  return {
    fileErrors: [],
    rows: rawRows.map((record, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, record[column]?.trim() ?? ''])),
      errors: record.length === headers.length ? [] : [`Expected ${headers.length} columns but found ${record.length}.`],
    })),
  };
}
