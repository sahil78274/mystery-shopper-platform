const REVIEW_DECISIONS = new Set(["approved", "rejected", "needs_correction"]);

export function shouldNotifyTaskAssignment(input: {
  previousShopperId: number | null;
  nextShopperId: number | null;
  previousStatus: string;
  nextStatus: string;
}): boolean {
  return input.nextShopperId !== null &&
    input.nextStatus === "assigned" &&
    (input.previousShopperId !== input.nextShopperId || input.previousStatus !== "assigned");
}

export function shouldNotifyReviewDecision(previousStatus: string, nextStatus: string): boolean {
  return (previousStatus === "submitted" || previousStatus === "under_review") &&
    REVIEW_DECISIONS.has(nextStatus);
}

export function shouldNotifyShopperDecision(previousStatus: string, nextStatus: string): boolean {
  return previousStatus !== nextStatus &&
    (nextStatus === "verified" || nextStatus === "rejected");
}
