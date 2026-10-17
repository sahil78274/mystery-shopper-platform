import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrendPoints, filterTrendByDateRange } from './trends.ts';

const now = new Date('2026-10-17T12:00:00.000Z');

test('monthly trends count every approved report and average only reports with scores', () => {
  const points = buildTrendPoints(
    [
      { submittedAt: '2026-09-04T10:00:00.000Z', score: 60 },
      { submittedAt: '2026-10-02T10:00:00.000Z', score: 80 },
      { submittedAt: '2026-10-09T10:00:00.000Z', score: null },
      { submittedAt: '2026-08-30T10:00:00.000Z', score: 100 },
      { submittedAt: null, score: 40 },
    ],
    2,
    now,
  );
  assert.deepEqual(points, [
    { month: '2026-09', reports: 1, averageScore: 60 },
    { month: '2026-10', reports: 2, averageScore: 80 },
  ]);
});

test('trend date filters are inclusive by calendar month', () => {
  const points = buildTrendPoints([], 3, now);
  assert.deepEqual(filterTrendByDateRange(points, '2026-10-17', '2026-10-18'), [
    { month: '2026-10', reports: 0, averageScore: null },
  ]);
  assert.deepEqual(filterTrendByDateRange(points, '2026-11-01'), []);
  assert.throws(() => buildTrendPoints([], 0, now), RangeError);
});
