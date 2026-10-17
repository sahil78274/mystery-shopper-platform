export type TrendPoint = {
  month: string;
  reports: number;
  averageScore: number | null;
};

export type TrendReport = {
  submittedAt: Date | string | null;
  score: number | null;
};

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Build zero-filled monthly buckets; report volume includes approved reports with no score. */
export function buildTrendPoints(
  reports: readonly TrendReport[],
  months: number,
  now = new Date(),
): TrendPoint[] {
  if (!Number.isInteger(months) || months < 1) throw new RangeError("months must be a positive integer");
  const monthKeys: string[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    monthKeys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))));
  }

  const buckets = new Map<string, { reports: number; scores: number[] }>();
  for (const report of reports) {
    if (!report.submittedAt) continue;
    const date = report.submittedAt instanceof Date ? report.submittedAt : new Date(report.submittedAt);
    if (Number.isNaN(date.valueOf())) continue;
    const key = monthKey(date);
    const bucket = buckets.get(key) ?? { reports: 0, scores: [] };
    bucket.reports += 1;
    if (report.score != null) bucket.scores.push(report.score);
    buckets.set(key, bucket);
  }

  return monthKeys.map((month) => {
    const bucket = buckets.get(month) ?? { reports: 0, scores: [] };
    return {
      month,
      reports: bucket.reports,
      averageScore: bucket.scores.length
        ? Math.round((bucket.scores.reduce((sum, score) => sum + score, 0) / bucket.scores.length) * 10) / 10
        : null,
    };
  });
}

/** Date inputs are day-based, but trends are monthly, so matching calendar months are inclusive. */
export function filterTrendByDateRange(
  points: readonly TrendPoint[],
  from?: string,
  to?: string,
): TrendPoint[] {
  return points.filter(
    ({ month }) => (!from || month >= from.slice(0, 7)) && (!to || month <= to.slice(0, 7)),
  );
}
