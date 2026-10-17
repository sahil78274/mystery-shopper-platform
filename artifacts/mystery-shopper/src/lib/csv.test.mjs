import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, csvRow } from './csv.ts';

test('CSV cells protect spreadsheet formulas and escape delimiters', () => {
  assert.equal(csvCell('=HYPERLINK("https://bad.invalid")'), "\"'=HYPERLINK(\"\"https://bad.invalid\"\")\"");
  assert.equal(csvCell('+1+1'), "'+1+1");
  assert.equal(csvCell('  =SUM(A1:A2)'), "'  =SUM(A1:A2)");
  assert.equal(csvCell('plain, text'), '"plain, text"');
  assert.equal(csvCell(null), '');
});

test('CSV rows consistently terminate with CRLF', () => {
  assert.equal(csvRow(['report', 'a\nb']), 'report,"a\nb"\r\n');
});
