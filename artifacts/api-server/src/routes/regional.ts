import { and, asc, desc, eq, gte, ilike, lte, ne, sql } from "drizzle-orm";
import { Router, type IRouter, type Response } from "express";
import {
  ExportRegionalDataQueryParams,
  GetRegionalComparisonResponse,
  GetRegionalOverviewResponse,
  GetRegionalScorecardsQueryParams,
  GetRegionalScorecardsResponse,
  GetRegionalTrendsQueryParams,
  GetRegionalTrendsResponse,
} from "@workspace/api-zod";
import {
  db,
  shoppersTable,
  storesTable,
  submissionsTable,
  tasksTable,
  SCORED_SUBMISSION_STATUS,
} from "@workspace/db";
import { regionScopeFor, requireAssignedRegion, requireRoleOrAdmin, type AuthUser } from "../lib/auth";
import { validDateRange } from "../lib/validation";
import { buildTrendPoints, filterTrendByDateRange } from "../lib/trends";
import { canViewSubmissionStatus } from "../lib/workflow";
import { calendarDate, csvRow, iso, roundScore } from "../lib/platform";
import { countEvidence, scopeConditions, toSubmissionSummary } from "../lib/submissions";

const router: IRouter = Router();

type ScoreRow = {
  id: number;
  storeId: number;
  score: number | null;
  submittedAt: Date | null;
  status: string;
};

type Scorecard = {
  storeId: number;
  storeName: string;
  storeCode: string;
  brandName: string;
  region: string;
  city: string;
  visits: number;
  averageScore: number | null;
  lastVisitDate: string | null;
  lastScore: number | null;
  previousScore: number | null;
  trend: number | null;
};

// Only approved reports feed official scores, and every query in this module
// is scoped to the executive's own region.
async function approvedSubmissions(user: AuthUser) {
  const conditions = [eq(submissionsTable.status, SCORED_SUBMISSION_STATUS)];
  const region = regionScopeFor(user);
  if (user.role === "regional_executive") {
    conditions.push(region ? eq(storesTable.region, region) : sql`false`);
  }
  return db
    .select({
      id: submissionsTable.id,
      storeId: submissionsTable.storeId,
      score: submissionsTable.score,
      submittedAt: submissionsTable.submittedAt,
      status: submissionsTable.status,
    })
    .from(submissionsTable)
    .innerJoin(storesTable, eq(submissionsTable.storeId, storesTable.id))
    .where(and(...conditions))
    .orderBy(desc(submissionsTable.submittedAt));
}

async function buildScorecards(
  user: AuthUser,
  search?: string,
): Promise<Scorecard[]> {
  const storeConditions = [];
  const region = regionScopeFor(user);
  if (user.role === "regional_executive") {
    storeConditions.push(region ? eq(storesTable.region, region) : sql`false`);
  }
  if (search) storeConditions.push(ilike(storesTable.name, `%${search}%`));
  const stores = await db
    .select()
    .from(storesTable)
    .where(storeConditions.length ? and(...storeConditions) : undefined)
    .orderBy(asc(storesTable.name));

  const reports = await approvedSubmissions(user);
  const byStore = new Map<number, ScoreRow[]>();
  for (const report of reports) {
    const list = byStore.get(report.storeId) ?? [];
    list.push(report as ScoreRow);
    byStore.set(report.storeId, list);
  }

  return stores.map((store) => {
    const rows = byStore.get(store.id) ?? [];
    const scored = rows.map((row) => row.score).filter((score): score is number => score != null);
    const ordered = rows
      .filter((row) => row.submittedAt)
      .sort((a, b) => (b.submittedAt!.getTime() ?? 0) - (a.submittedAt!.getTime() ?? 0));
    const last = ordered[0];
    const previous = ordered[1];
    const averageScore = scored.length
      ? roundScore(scored.reduce((sum, value) => sum + value, 0) / scored.length)
      : null;
    return {
      storeId: store.id,
      storeName: store.name,
      storeCode: store.code,
      brandName: store.brandName,
      region: store.region,
      city: store.city,
      visits: rows.length,
      averageScore,
      lastVisitDate: last?.submittedAt ? calendarDate(last.submittedAt) : null,
      lastScore: last?.score ?? null,
      previousScore: previous?.score ?? null,
      trend:
        last?.score != null && previous?.score != null
          ? roundScore(last.score - previous.score)
          : null,
    };
  });
}

async function buildTrend(user: AuthUser, months: number) {
  return buildTrendPoints(await approvedSubmissions(user), months);
}

async function networkAverage(): Promise<number | null> {
  const rows = await db
    .select({ score: submissionsTable.score })
    .from(submissionsTable)
    .where(eq(submissionsTable.status, SCORED_SUBMISSION_STATUS));
  const values = rows.map((row) => row.score).filter((score): score is number => score != null);
  if (!values.length) return null;
  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// A regional executive may only ever ask about their own region. Unknown or
// omitted region filters simply fall back to the caller's scope, but an
// explicit request for another region is rejected instead of silently ignored.
function foreignRegion(user: AuthUser, requested: unknown): boolean {
  const scope = regionScopeFor(user);
  if (user.role !== "regional_executive") return false;
  if (!scope) return true;
  if (typeof requested !== "string" || !requested.trim()) return false;
  return requested.trim().toLowerCase() !== scope.toLowerCase();
}

function regionForbidden(res: Response): void {
  res.status(403).json({ error: "You can only access data for your own region." });
}

router.get("/regional/overview", requireRoleOrAdmin("regional_executive"), requireAssignedRegion, async (req, res): Promise<void> => {
  const user = req.authUser!;
  if (foreignRegion(user, req.query.region)) {
    regionForbidden(res);
    return;
  }
  const [scorecards, trend, recent] = await Promise.all([
    buildScorecards(user),
    buildTrend(user, 6),
    listRegionalReports(user, { limit: 6 }),
  ]);

  const scores = scorecards
    .map((card) => card.averageScore)
    .filter((score): score is number => score != null);
  const ranked = [...scorecards.filter((card) => card.averageScore != null)].sort(
    (a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0),
  );

  res.json(
    GetRegionalOverviewResponse.parse({
      region: user.role === "regional_executive" ? user.region : null,
      stores: scorecards.length,
      approvedReports: scorecards.reduce((sum, card) => sum + card.visits, 0),
      pendingReports: recent.pending,
      needsCorrection: recent.needsCorrection,
      averageScore: scores.length
        ? roundScore(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : null,
      networkAverageScore: await networkAverage(),
      trend,
      topStores: ranked.slice(0, 5),
      focusStores: ranked.slice(-5).reverse(),
      recentReports: recent.reports,
    }),
  );
});

router.get("/regional/scorecards", requireRoleOrAdmin("regional_executive"), requireAssignedRegion, async (req, res): Promise<void> => {
  const parsed = GetRegionalScorecardsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (foreignRegion(req.authUser!, req.query.region)) {
    regionForbidden(res);
    return;
  }
  const rows = await buildScorecards(req.authUser!, parsed.data.search ?? undefined);
  res.json(GetRegionalScorecardsResponse.parse(rows));
});

router.get("/regional/comparison", requireRoleOrAdmin("regional_executive"), requireAssignedRegion, async (req, res): Promise<void> => {
  const user = req.authUser!;
  if (foreignRegion(user, req.query.region)) {
    regionForbidden(res);
    return;
  }
  const scorecards = await buildScorecards(user);
  const scored = scorecards.filter((card) => card.averageScore != null);
  const ranked = [...scored].sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
  const visits = scorecards.reduce((sum, card) => sum + card.visits, 0);
  const scores = scored.map((card) => card.averageScore as number);
  res.json(
    GetRegionalComparisonResponse.parse({
      region: user.role === "regional_executive" ? user.region : null,
      stores: scorecards.length,
      visits,
      averageScore: scores.length
        ? roundScore(scores.reduce((sum, value) => sum + value, 0) / scores.length)
        : null,
      networkAverageScore: await networkAverage(),
      topStore: ranked[0],
      bottomStore: ranked.length ? ranked[ranked.length - 1] : undefined,
      scorecards,
    }),
  );
});

router.get("/regional/trends", requireRoleOrAdmin("regional_executive"), requireAssignedRegion, async (req, res): Promise<void> => {
  const parsed = GetRegionalTrendsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (foreignRegion(req.authUser!, req.query.region)) {
    regionForbidden(res);
    return;
  }
  const months = parsed.data.months ?? 6;
  res.json(GetRegionalTrendsResponse.parse(await buildTrend(req.authUser!, months)));
});

router.get("/regional/export", requireRoleOrAdmin("regional_executive"), requireAssignedRegion, async (req, res): Promise<void> => {
  const parsed = ExportRegionalDataQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = req.authUser!;
  if (foreignRegion(user, req.query.region)) {
    regionForbidden(res);
    return;
  }
  const { dataset, from, to, months } = parsed.data;
  if (!validDateRange(from ?? undefined, to ?? undefined)) {
    res.status(400).json({ error: "Invalid date range." });
    return;
  }
  const rows: string[] = [];

  if (dataset === "scorecards") {
    const cards = await buildScorecards(user);
    rows.push(
      csvRow([
        "Store",
        "Code",
        "Brand",
        "Region",
        "City",
        "Approved visits",
        "Average score",
        "Last visit",
        "Last score",
        "Previous score",
        "Trend",
      ]),
    );
    for (const card of cards) {
      rows.push(
        csvRow([
          card.storeName,
          card.storeCode,
          card.brandName,
          card.region,
          card.city,
          card.visits,
          card.averageScore ?? "",
          card.lastVisitDate ?? "",
          card.lastScore ?? "",
          card.previousScore ?? "",
          card.trend ?? "",
        ]),
      );
    }
  } else if (dataset === "trends") {
    const trend = await buildTrend(user, months ?? 12);
    rows.push(csvRow(["Month", "Approved reports", "Average score"]));
    for (const point of filterTrendByDateRange(trend, from ?? undefined, to ?? undefined)) {
      rows.push(csvRow([point.month, point.reports, point.averageScore ?? ""]));
    }
  } else {
    const conditions = scopeConditions(user);
    conditions.push(eq(submissionsTable.status, SCORED_SUBMISSION_STATUS));
    if (from) conditions.push(gte(submissionsTable.submittedAt, new Date(from)));
    if (to) conditions.push(lte(submissionsTable.submittedAt, new Date(`${to}T23:59:59.999Z`)));
    const reports = await db
      .select({
        submission: submissionsTable,
        storeName: storesTable.name,
        storeCode: storesTable.code,
        storeRegion: storesTable.region,
        storeCity: storesTable.city,
        shopperName: shoppersTable.fullName,
        task: tasksTable,
      })
      .from(submissionsTable)
      .innerJoin(storesTable, eq(submissionsTable.storeId, storesTable.id))
      .leftJoin(shoppersTable, eq(submissionsTable.shopperId, shoppersTable.id))
      .innerJoin(tasksTable, eq(submissionsTable.taskId, tasksTable.id))
      .where(and(...conditions))
      .orderBy(desc(submissionsTable.submittedAt));
    rows.push(
      csvRow([
        "Report",
        "Store",
        "Code",
        "Region",
        "City",
        "Shopper",
        "Visit date",
        "Submitted",
        "Score",
        "Status",
        "Reviewer comment",
      ]),
    );
    for (const row of reports) {
      rows.push(
        csvRow([
          row.submission.id,
          row.storeName,
          row.storeCode,
          row.storeRegion,
          row.storeCity,
          row.shopperName ?? "",
          calendarDate(row.task.visitDate),
          iso(row.submission.submittedAt),
          row.submission.score ?? "",
          row.submission.status,
          row.submission.reviewerComment ?? "",
        ]),
      );
    }
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="regional-${dataset}.csv"`);
  res.send(rows.join(""));
});

async function listRegionalReports(
  user: AuthUser,
  options: { limit?: number } = {},
) {
  const conditions = scopeConditions(user);
  if (!canViewSubmissionStatus(user.role, "draft")) {
    conditions.push(ne(submissionsTable.status, "draft"));
  }
  const rows = await db
    .select({
      submission: submissionsTable,
      storeName: storesTable.name,
      storeCode: storesTable.code,
      storeRegion: storesTable.region,
      storeCity: storesTable.city,
      shopperName: shoppersTable.fullName,
      task: tasksTable,
    })
    .from(submissionsTable)
    .innerJoin(storesTable, eq(submissionsTable.storeId, storesTable.id))
    .leftJoin(shoppersTable, eq(submissionsTable.shopperId, shoppersTable.id))
    .innerJoin(tasksTable, eq(submissionsTable.taskId, tasksTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(submissionsTable.updatedAt));

  const all = await Promise.all(
    rows.map(async (row) =>
      toSubmissionSummary(
        { ...row, reviewerName: null, evidenceCount: await countEvidence(row.submission.id) },
        user,
      ),
    ),
  );
  return {
    reports: all.slice(0, options.limit ?? all.length),
    pending: all.filter((row) => row.status === "submitted" || row.status === "under_review").length,
    needsCorrection: all.filter((row) => row.status === "needs_correction").length,
  };
}

export default router;
