/**
 * RPT-05 / D-088: a minimal, dependency-free PDF 1.4 writer for report
 * exports. Standard Helvetica, escaped literal strings, byte-exact xref.
 * Deliberately plain: the governed data, its period and its formula notes
 * are the content; typography is not.
 */

export type PdfSection = {
  title: string;
  columns: string[];
  rows: Array<Array<string | number>>;
};

export type PdfDocumentModel = {
  title: string;
  generatedAt: string;
  windowLabel: string;
  filtersLabel: string;
  formulaNotes: string[];
  sections: PdfSection[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const LINE_HEIGHT = 15;
const LINES_PER_PAGE = 46;
const MAX_CELL = 42;

function escapePdfText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replace(/[^\x20-\x7E]/g, '?');
}

function cell(value: string | number): string {
  const text = String(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
}

function renderRow(columns: string[], columnWidths: number[]): string {
  return columns.map((value, index) => cell(value).padEnd(columnWidths[index])).join(' ').trimEnd();
}

function buildLines(model: PdfDocumentModel): Array<{ text: string; size: number; bold: boolean }> {
  const lines: Array<{ text: string; size: number; bold: boolean }> = [];
  const push = (text: string, size = 9, bold = false) => lines.push({ text, size, bold });
  push(model.title, 16, true);
  push(`Generated ${model.generatedAt} · Africa/Accra (UTC) · Window: ${model.windowLabel}`, 9);
  push(`Filters: ${model.filtersLabel}`, 9);
  push('');
  for (const section of model.sections) {
    push(section.title, 12, true);
    if (section.columns.length > 0) {
      const usable = PAGE_WIDTH - MARGIN * 2;
      const width = Math.max(10, Math.floor(usable / Math.max(1, section.columns.length) / 5.4));
      const widths = section.columns.map(() => width);
      push(renderRow(section.columns, widths), 9, true);
      for (const row of section.rows) {
        push(renderRow(row.map(String), widths), 9);
      }
      if (section.rows.length === 0) push('(no rows)', 9);
    }
    push('');
  }
  push('Notes', 12, true);
  for (const note of model.formulaNotes) {
    // Cheap word wrap at ~105 characters for readability.
    const words = note.split(' ');
    let current = '';
    for (const word of words) {
      if (`${current} ${word}`.trim().length > 105) {
        push(current.trim(), 8);
        current = word;
      } else {
        current = `${current} ${word}`;
      }
    }
    if (current.trim()) push(current.trim(), 8);
  }
  return lines;
}

export function renderPdf(model: PdfDocumentModel): Buffer {
  const lines = buildLines(model);
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + LINES_PER_PAGE).map((line, offset) => {
      const y = PAGE_HEIGHT - MARGIN - offset * LINE_HEIGHT;
      const font = line.bold ? 'F2' : 'F1';
      return `BT /${font} ${line.size} Tf ${MARGIN} ${y} Td (${escapePdfText(line.text)}) Tj ET`;
    }));
  }
  if (pages.length === 0) pages.push([]);

  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: Font regular, 4: Font bold; page objects follow.
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);
  objects[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  objects[4] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`;
  pages.forEach((contentLines, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    const content = contentLines.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
  });

  const chunks: Buffer[] = [];
  const offsets: number[] = [];
  let cursor = 0;
  const push = (text: string) => {
    const buffer = Buffer.from(text, 'latin1');
    chunks.push(buffer);
    cursor += buffer.length;
  };
  push('%PDF-1.4\n');
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = cursor;
    push(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }
  const xrefStart = cursor;
  const count = objects.length - 1;
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= count; id += 1) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  push(`${xref}trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return Buffer.concat(chunks);
}
