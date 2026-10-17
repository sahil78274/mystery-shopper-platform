import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessQuestionnaire,
  canAccessRegion,
  canAccessShopperDirectory,
  canAccessShopperProfile,
  canChangeTaskStore,
  canKeepActiveAdmin,
  canReassignTask,
  canResumeSubmission,
  canTransitionReview,
  canViewSubmissionStatus,
  hasAssignedRegion,
  isReviewStatusAllowed,
} from './workflow.ts';

test('a role or status change cannot remove the last active administrator', () => {
  assert.equal(canKeepActiveAdmin('admin', 'reviewer', 'active', 0), false);
  assert.equal(canKeepActiveAdmin('admin', 'admin', 'inactive', 0), false);
  assert.equal(canKeepActiveAdmin('admin', 'reviewer', 'active', 1), true);
  assert.equal(canKeepActiveAdmin('reviewer', 'reviewer', 'inactive', 0), true);
});

test('review transitions only allow reports that are awaiting a decision', () => {
  assert.equal(canTransitionReview('submitted', 'under_review'), true);
  assert.equal(canTransitionReview('under_review', 'approved'), true);
  assert.equal(canTransitionReview('submitted', 'needs_correction'), true);
  assert.equal(canTransitionReview('approved', 'rejected'), false);
  assert.equal(canTransitionReview('draft', 'approved'), false);
  assert.equal(isReviewStatusAllowed(undefined, ['submitted', 'under_review']), true);
  assert.equal(isReviewStatusAllowed('approved', ['submitted', 'under_review']), false);
});

test('a task with a report cannot be reassigned to another shopper or store', () => {
  assert.equal(canReassignTask(false, null, 8), true);
  assert.equal(canReassignTask(true, 8, 8), true);
  assert.equal(canReassignTask(true, 8, 9), false);
  assert.equal(canReassignTask(true, 8, null), false);
  assert.equal(canChangeTaskStore(false, 12, 13), true);
  assert.equal(canChangeTaskStore(true, 12, 12), true);
  assert.equal(canChangeTaskStore(true, 12, 13), false);
});

test('unsubmitted drafts remain private to shoppers and administrators', () => {
  assert.equal(canViewSubmissionStatus('admin', 'draft'), true);
  assert.equal(canViewSubmissionStatus('mystery_shopper', 'draft'), true);
  assert.equal(canViewSubmissionStatus('reviewer', 'draft'), false);
  assert.equal(canViewSubmissionStatus('regional_executive', 'draft'), false);
  assert.equal(canViewSubmissionStatus('reviewer', 'submitted'), true);
});

test('a shopper may resume only their own assigned report', () => {
  assert.equal(canResumeSubmission(8, 8, 8), true);
  assert.equal(canResumeSubmission(8, 9, 8), false);
  assert.equal(canResumeSubmission(8, 8, 9), false);
});

test('role and region predicates fail closed for unassigned regional accounts', () => {
  assert.equal(hasAssignedRegion('regional_executive', 'North'), true);
  assert.equal(hasAssignedRegion('regional_executive', '  '), false);
  assert.equal(canAccessRegion('regional_executive', ' North ', 'North'), true);
  assert.equal(canAccessRegion('regional_executive', 'North', 'South'), false);
  assert.equal(canAccessRegion('regional_executive', '  ', 'North'), false);
  assert.equal(canAccessRegion('admin', null, 'North'), true);
  assert.equal(canAccessRegion('reviewer', null, 'North'), true);
  assert.equal(hasAssignedRegion('reviewer', null), true);
  assert.equal(canAccessShopperDirectory('admin'), true);
  assert.equal(canAccessShopperDirectory('reviewer'), false);
  assert.equal(canAccessShopperProfile('mystery_shopper', 8, 8), true);
  assert.equal(canAccessShopperProfile('mystery_shopper', 8, 9), false);
  assert.equal(canAccessQuestionnaire('mystery_shopper', true), true);
  assert.equal(canAccessQuestionnaire('reviewer', true), false);
});
