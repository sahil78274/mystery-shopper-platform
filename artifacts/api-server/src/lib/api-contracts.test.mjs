import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GetRegionalScorecardsResponseItem,
  GetSubmissionsResponseItem,
  GetTasksResponseItem,
} from '../../../../lib/api-zod/src/generated/api.ts';

const instant = '2026-10-17T12:00:00.000Z';
const visitDate = '2026-10-16';
const dueDate = '2026-10-18';

const task = {
  id: 1,
  storeId: 2,
  shopperId: 3,
  questionnaireId: null,
  visitDate,
  dueDate,
  instructions: 'Check the service area',
  priority: 'medium',
  status: 'submitted',
  storeName: 'Ricoz Central',
  storeCode: 'RC-01',
  shopperName: 'A Shopper',
  questionnaireTitle: null,
  submittedAt: instant,
  reviewerComment: null,
  reviewedAt: null,
  createdAt: instant,
  updatedAt: instant,
};

const submission = {
  id: 4,
  taskId: 1,
  shopperId: 3,
  shopperName: 'A Shopper',
  storeId: 2,
  storeName: 'Ricoz Central',
  storeCode: 'RC-01',
  storeRegion: 'North',
  storeCity: 'Rohtak',
  visitDate,
  dueDate,
  status: 'submitted',
  score: null,
  comment: null,
  evidenceCount: 1,
  submittedAt: instant,
  reviewedAt: null,
  reviewerName: null,
  reviewerComment: null,
  canEdit: false,
  createdAt: instant,
  updatedAt: instant,
};

const scorecard = {
  storeId: 2,
  storeName: 'Ricoz Central',
  storeCode: 'RC-01',
  brandName: 'Ricoz',
  region: 'North',
  city: 'Rohtak',
  visits: 1,
  averageScore: 80,
  lastVisitDate: visitDate,
  lastScore: 80,
  previousScore: null,
  trend: null,
};

test('date-only API response fields stay date-only strings after Zod validation', () => {
  for (const [schema, value, field] of [
    [GetTasksResponseItem, task, 'visitDate'],
    [GetSubmissionsResponseItem, submission, 'visitDate'],
    [GetRegionalScorecardsResponseItem, scorecard, 'lastVisitDate'],
  ]) {
    const parsed = schema.parse(value);
    assert.equal(parsed[field], visitDate);
    assert.equal(typeof parsed[field], 'string');
  }
});
