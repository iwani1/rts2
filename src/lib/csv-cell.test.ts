import { describe, expect, it } from 'vitest';
import { csvCell } from './csv-cell';

describe('csvCell (hardening: spreadsheet formula injection)', () => {
  it('neutralises formula prefixes while keeping text visible', () => {
    expect(csvCell('=2+5')).toBe("'=2+5");
    expect(csvCell('+233 20 000 0000')).toBe("'+233 20 000 0000");
    expect(csvCell('-10')).toBe("'-10");
    expect(csvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(csvCell('\t=1')).toBe("'\t=1");
  });

  it('still quotes commas, quotes and newlines, and blanks nulls', () => {
    expect(csvCell('Accra, Ghana')).toBe('"Accra, Ghana"');
    expect(csvCell('He said "go"')).toBe('"He said ""go"""');
    expect(csvCell('one\ntwo')).toBe('"one\ntwo"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
    expect(csvCell('Normal name')).toBe('Normal name');
  });

  it('combines prefix neutralisation with quoting', () => {
    expect(csvCell('=A1,B2')).toBe('"\'=A1,B2"');
  });
});
