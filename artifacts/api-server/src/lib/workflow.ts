export const REVIEWABLE_SUBMISSION_STATUSES = ["submitted", "under_review"] as const;
export const REVIEW_DECISION_STATUSES = ["approved", "rejected", "needs_correction"] as const;
export const ADMIN_MANAGED_TASK_STATUSES = ["draft", "assigned", "cancelled"] as const;

export function canTransitionReview(currentStatus: string, nextStatus: string): boolean {
  return (
    REVIEWABLE_SUBMISSION_STATUSES.includes(currentStatus as (typeof REVIEWABLE_SUBMISSION_STATUSES)[number]) &&
    (nextStatus === "under_review" ||
      REVIEW_DECISION_STATUSES.includes(nextStatus as (typeof REVIEW_DECISION_STATUSES)[number]))
  );
}

export function isReviewStatusAllowed(
  status: string | undefined,
  allowedStatuses: readonly string[],
): boolean {
  return status === undefined || allowedStatuses.includes(status);
}

export function canReassignTask(
  hasSubmission: boolean,
  reportShopperId: number | null,
  nextShopperId: number | null,
): boolean {
  return !hasSubmission || reportShopperId === nextShopperId;
}

/** A report captures its store at creation, so keep that store immutable afterward. */
export function canChangeTaskStore(
  hasSubmission: boolean,
  currentStoreId: number,
  nextStoreId: number,
): boolean {
  return !hasSubmission || currentStoreId === nextStoreId;
}

/** Normalize the assigned region once and fail closed for blank regional scopes. */
export function normalizedRegionScope(
  role: string,
  region: string | null | undefined,
): string | null {
  return role === "regional_executive" ? region?.trim() || null : null;
}

export function canAccessRegion(
  role: string,
  assignedRegion: string | null | undefined,
  resourceRegion: string,
): boolean {
  if (role !== "regional_executive") return true;
  const scope = normalizedRegionScope(role, assignedRegion);
  return Boolean(scope && scope === resourceRegion);
}

export function canResumeSubmission(
  actorShopperId: number,
  taskShopperId: number | null,
  submissionShopperId: number,
): boolean {
  return taskShopperId === actorShopperId && submissionShopperId === actorShopperId;
}

export function hasAssignedRegion(role: string, region: string | null | undefined): boolean {
  return role !== "regional_executive" || Boolean(region?.trim());
}

export function canAccessShopperDirectory(role: string): boolean {
  return role === "admin" || role === "mystery_shopper";
}

export function canAccessShopperProfile(
  role: string,
  actorShopperId: number | null,
  targetShopperId: number,
): boolean {
  return role === "admin" || (role === "mystery_shopper" && actorShopperId === targetShopperId);
}

export function canAccessQuestionnaire(role: string, assignedToShopper: boolean): boolean {
  return role === "admin" || (role === "mystery_shopper" && assignedToShopper);
}

/** Draft reports remain private to their shopper and administrators. */
export function canViewSubmissionStatus(role: string, status: string): boolean {
  return status !== "draft" || role === "admin" || role === "mystery_shopper";
}
