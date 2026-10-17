import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeImageEvidence } from './evidence.ts';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

test('image evidence accepts strict Base64 with a matching MIME signature', () => {
  assert.deepEqual(decodeImageEvidence(jpeg.toString('base64'), 'image/jpeg'), jpeg);
  assert.deepEqual(
    decodeImageEvidence(`data:image/png;base64,${png.toString('base64')}`, 'image/png'),
    png,
  );
});

test('image evidence rejects MIME/signature mismatches, malformed Base64, and mismatched data URLs', () => {
  assert.equal(decodeImageEvidence(jpeg.toString('base64'), 'image/png'), null);
  assert.equal(decodeImageEvidence('not base64!', 'image/jpeg'), null);
  assert.equal(decodeImageEvidence('AAAAA', 'image/jpeg'), null);
  assert.equal(
    decodeImageEvidence(`data:image/jpeg;base64,${jpeg.toString('base64')}`, 'image/png'),
    null,
  );
});
