export type CsvSection = {
  title: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
};

export type CsvDocument = {
  title: string;
  generatedAt: string;
  timezone: string;
  windowLabel: string;
  filtersLabel: string;
  formulaNotes: string[];
  sections: CsvSection[];
};

import { csvCell as escapeCell } from '@/lib/csv-cell';

/**
 * RPT-04 export document: metadata comment lines (filter period, generation
 * time, timezone, formula/coverage notes per docs/KPIS.md) followed by one
 * labelled section per report table. Metadata lives in `#` comment lines so
 * the data rows stay machine-readable.
 */
export function buildCsv(document: CsvDocument): string {
  const lines: string[] = [
    `# ${document.title}`,
    `# Generated: ${document.generatedAt}`,
    `# Timezone: ${document.timezone}`,
    `# Window: ${document.windowLabel}`,
    `# Filters: ${document.filtersLabel}`,
    ...document.formulaNotes.map((note) => `# Formula: ${note}`),
  ];
  for (const section of document.sections) {
    lines.push(`# Section: ${section.title}`);
    lines.push(section.columns.map(escapeCell).join(','));
    for (const row of section.rows) lines.push(row.map(escapeCell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
