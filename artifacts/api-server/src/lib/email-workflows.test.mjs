import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldNotifyReviewDecision,
  shouldNotifyShopperDecision,
  shouldNotifyTaskAssignment,
} from './email-workflows.ts';

test('assignment notifications occur for a new assignment or a real reassignment, not task edits', () => {
  assert.equal(shouldNotifyTaskAssignment({ previousShopperId: null, nextShopperId: 4, previousStatus: 'draft', nextStatus: 'assigned' }), true);
  assert.equal(shouldNotifyTaskAssignment({ previousShopperId: 4, nextShopperId: 5, previousStatus: 'assigned', nextStatus: 'assigned' }), true);
  assert.equal(shouldNotifyTaskAssignment({ previousShopperId: 4, nextShopperId: 4, previousStatus: 'assigned', nextStatus: 'assigned' }), false);
  assert.equal(shouldNotifyTaskAssignment({ previousShopperId: 4, nextShopperId: 4, previousStatus: 'draft', nextStatus: 'draft' }), false);
  assert.equal(shouldNotifyTaskAssignment({ previousShopperId: 4, nextShopperId: null, previousStatus: 'assigned', nextStatus: 'cancelled' }), false);
});

test('review notifications are limited to the first successful final decision', () => {
  assert.equal(shouldNotifyReviewDecision('submitted', 'approved'), true);
  assert.equal(shouldNotifyReviewDecision('under_review', 'needs_correction'), true);
  assert.equal(shouldNotifyReviewDecision('submitted', 'under_review'), false);
  assert.equal(shouldNotifyReviewDecision('approved', 'approved'), false);
  assert.equal(shouldNotifyReviewDecision('rejected', 'approved'), false);
});

test('shopper approval mail is sent only when the verification status changes to a decision', () => {
  assert.equal(shouldNotifyShopperDecision('pending', 'verified'), true);
  assert.equal(shouldNotifyShopperDecision('pending', 'rejected'), true);
  assert.equal(shouldNotifyShopperDecision('verified', 'verified'), false);
  assert.equal(shouldNotifyShopperDecision('pending', 'pending'), false);
});
