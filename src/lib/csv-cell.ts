/**
 * Shared CSV cell safety (hardening pass, Phase 1C): quotes cells containing
 * commas, quotes or line breaks, and neutralises spreadsheet formula
 * prefixes. Free-text names and notes come from users; a cell starting with
 * `=`, `+`, `-`, `@`, a tab or a carriage return would otherwise be executed
 * as a formula when the export is opened in a spreadsheet. Prefixing with a
 * single quote keeps the text visible but inert.
 */
export function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
