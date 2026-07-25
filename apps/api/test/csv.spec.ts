import { describe, expect, it } from 'vitest';
import { csvCell } from '../src/sharing/sharing.service';

/**
 * CSV cells must be safe against spreadsheet formula injection: user-controlled
 * values (player names) reach the public export, and a leading =, +, -, or @
 * would execute as a formula when opened in Excel / Google Sheets.
 */
describe('csvCell', () => {
  it('passes plain values through unchanged', () => {
    expect(csvCell('Ada Kwei')).toBe('Ada Kwei');
    expect(csvCell('42')).toBe('42');
    expect(csvCell('')).toBe('');
  });

  it('quotes values containing delimiters, quotes, or newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralizes leading formula characters', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\t=cmd')).toBe("'\t=cmd");
  });

  it('still quotes neutralized values that contain delimiters', () => {
    expect(csvCell('=1,2')).toBe(`"'=1,2"`);
  });
});
