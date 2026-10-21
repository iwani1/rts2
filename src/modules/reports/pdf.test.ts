import { describe, expect, it } from 'vitest';
import { renderPdf, type PdfDocumentModel } from './pdf';

function model(rows = 3): PdfDocumentModel {
  return {
    title: 'Test report (RPT-05)',
    generatedAt: '2026-10-21T00:00:00.000Z',
    windowLabel: 'All time',
    filtersLabel: 'none',
    formulaNotes: ['Figures reconcile to the underlying records.'],
    sections: [
      {
        title: 'Totals',
        columns: ['Metric', 'GHS'],
        rows: Array.from({ length: rows }, (_, index) => [`Metric ${index}`, `${index}.00`]),
      },
    ],
  };
}

describe('dependency-free PDF writer (RPT-05 / D-088)', () => {
  it('produces a structurally valid single-page PDF', () => {
    const pdf = renderPdf(model());
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 1');
    expect(text).toContain('Test report');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // xref offsets point at real object headers.
    const xrefStart = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(text.slice(xrefStart, xrefStart + 4)).toBe('xref');
    const firstObjectOffset = Number(/xref\n0 \d+\n\d{10} \d{5} f \n(\d{10}) /.exec(text)?.[1]);
    expect(text.slice(firstObjectOffset, firstObjectOffset + 7)).toBe('1 0 obj');
  });

  it('paginates long reports and escapes PDF string syntax', () => {
    const pdf = renderPdf(model(300));
    const text = pdf.toString('latin1');
    const count = Number(/\/Count (\d+)/.exec(text)?.[1]);
    expect(count).toBeGreaterThan(1);
    const tricky = renderPdf({
      ...model(1),
      sections: [{ title: 'S (x) \\ y', columns: ['A'], rows: [['a(b)c\\d']] }],
    }).toString('latin1');
    expect(tricky).toContain('a\\(b\\)c\\\\d');
  });
});
