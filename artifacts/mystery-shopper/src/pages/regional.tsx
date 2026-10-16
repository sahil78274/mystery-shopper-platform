import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Download,
  Search,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  exportRegionalData,
  useGetRegionalComparison,
  useGetRegionalOverview,
  useGetRegionalScorecards,
  useGetRegionalTrends,
} from '@workspace/api-client-react';
import type { StoreScorecard } from '@workspace/api-client-react';
import { PageHeading, StateBlock, Status, Toast, messageOf, useNotify } from '@/components/common';
import { formatDate, formatDateTime, formatMonthLabel, formatScore, formatTrend } from '@/lib/format';
import { useAuth } from '@/lib/auth';

const CHART_BLUE = '#2f67b2';
const CHART_GREEN = '#3f8a6d';
const CHART_AMBER = '#c08a2e';

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ExportButton({
  dataset,
  from,
  to,
  label,
}: {
  dataset: 'scorecards' | 'reports' | 'trends';
  from?: string;
  to?: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const { notify } = useNotify();
  const run = async () => {
    setBusy(true);
    try {
      const csv = await exportRegionalData({
        dataset,
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      });
      downloadCsv(String(csv ?? ''), `regional-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`);
      notify(`Exported ${dataset}.csv`);
    } catch (reason) {
      notify(messageOf(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <button className="btn btn-sm" type="button" onClick={() => void run()} disabled={busy}>
      <Download size={14} /> {busy ? 'Exporting…' : label}
    </button>
  );
}

function ScoreBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="not-recorded">Not scored</span>;
  const tone = value >= 80 ? 'good' : value >= 60 ? 'ok' : 'low';
  return <span className={`score-badge score-${tone}`}>{formatScore(value)}</span>;
}

function TrendCell({ value }: { value: number | null }) {
  if (value == null) return <span className="not-recorded">—</span>;
  const up = value >= 0;
  return (
    <span className={`trend-cell ${up ? 'up' : 'down'}`}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {formatTrend(value)}
    </span>
  );
}

function RegionalDashboard() {
  const overview = useGetRegionalOverview();
  const { user } = useAuth();
  const data = overview.data;
  const trendData = useMemo(
    () => (data?.trend ?? []).map((point) => ({ ...point, label: formatMonthLabel(point.month) })),
    [data?.trend],
  );

  return (
    <>
      <PageHeading
        kicker="Regional performance"
        title="Regional dashboard"
        description={
          user?.region
            ? `Approved visit performance across ${user.region}.`
            : 'Approved visit performance across the network.'
        }
        action={<ExportButton dataset="reports" label="Export reports CSV" />}
      />
      {overview.isLoading ? (
        <div className="metric-grid">
          {[0, 1, 2, 3].map((key) => (
            <div className="panel metric-card" key={key}>
              <div className="skeleton" style={{ width: 90 }} />
              <div className="skeleton" style={{ width: 75, height: 30, marginTop: 18 }} />
            </div>
          ))}
        </div>
      ) : overview.isError ? (
        <div className="panel">
          <StateBlock error onRetry={() => overview.refetch()} />
        </div>
      ) : (
        <>
          <section className="metric-grid">
            <article className="panel metric-card">
              <div className="metric-top">
                <span>Regional average</span>
                <span className="metric-icon">
                  <Star size={16} />
                </span>
              </div>
              <div className="metric-value">{data?.averageScore != null ? `${data.averageScore}%` : '—'}</div>
              <div className="metric-foot">
                Network average {data?.networkAverageScore != null ? `${data.networkAverageScore}%` : '—'}
              </div>
            </article>
            <article className="panel metric-card">
              <div className="metric-top">
                <span>Stores covered</span>
                <span className="metric-icon">
                  <Building2 size={16} />
                </span>
              </div>
              <div className="metric-value">{data?.stores ?? 0}</div>
              <div className="metric-foot">Stores in your region</div>
            </article>
            <article className="panel metric-card">
              <div className="metric-top">
                <span>Approved reports</span>
                <span className="metric-icon">
                  <ClipboardCheck size={16} />
                </span>
              </div>
              <div className="metric-value">{data?.approvedReports ?? 0}</div>
              <div className="metric-foot">Only approved reports are scored</div>
            </article>
            <article className="panel metric-card">
              <div className="metric-top">
                <span>Awaiting action</span>
                <span className="metric-icon">
                  <Activity size={16} />
                </span>
              </div>
              <div className="metric-value">{(data?.pendingReports ?? 0) + (data?.needsCorrection ?? 0)}</div>
              <div className="metric-foot">
                {data?.pendingReports ?? 0} in review · {data?.needsCorrection ?? 0} need correction
              </div>
            </article>
          </section>

          <div className="dashboard-grid">
            <section className="panel">
              <header className="section-head">
                <div>
                  <h2 className="section-title">Performance trend</h2>
                  <div className="section-kicker">Approved report scores by month</div>
                </div>
                <ExportButton dataset="trends" label="Export CSV" />
              </header>
              {trendData.length ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendData} margin={{ top: 12, right: 18, bottom: 4, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b9495' }} stroke="#dfe4e7" />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: '#8b9495' }}
                        stroke="#dfe4e7"
                        tickFormatter={(value: number) => `${value}`}
                      />
                      <Tooltip
                        formatter={(value: number | string) => [`${value ?? 0}%`, 'Average score']}
                        labelFormatter={(label: string) => `Month: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="averageScore"
                        stroke={CHART_BLUE}
                        strokeWidth={2.4}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <StateBlock empty title="No trend data" description="Approved reports will build the trend." />
              )}
            </section>

            <section className="panel">
              <header className="section-head">
                <div>
                  <h2 className="section-title">Top performing stores</h2>
                  <div className="section-kicker">Highest approved averages</div>
                </div>
              </header>
              {data?.topStores?.length ? (
                <div className="rank-list">
                  {data.topStores.map((store, index) => (
                    <div className="rank-row" key={store.storeId}>
                      <span className="rank-num">{index + 1}</span>
                      <div className="rank-copy">
                        <strong>{store.storeName}</strong>
                        <span>
                          {store.visits} approved visit{store.visits === 1 ? '' : 's'} · {store.city}
                        </span>
                      </div>
                      <ScoreBadge value={store.averageScore} />
                    </div>
                  ))}
                </div>
              ) : (
                <StateBlock empty title="No scored stores" description="Approve reports to rank stores." />
              )}
            </section>
          </div>

          <section className="panel" style={{ marginTop: 18 }}>
            <header className="section-head">
              <div>
                <h2 className="section-title">Stores needing attention</h2>
                <div className="section-kicker">Lowest approved averages in the region</div>
              </div>
            </header>
            {data?.focusStores?.length ? (
              <div className="rank-list">
                {data.focusStores.map((store) => (
                  <div className="rank-row" key={store.storeId}>
                    <span className="rank-num warn">
                      <TrendingDown size={13} />
                    </span>
                    <div className="rank-copy">
                      <strong>{store.storeName}</strong>
                      <span>
                        {store.city} · last visit {store.lastVisitDate ? formatDate(store.lastVisitDate) : '—'}
                      </span>
                    </div>
                    <ScoreBadge value={store.averageScore} />
                  </div>
                ))}
              </div>
            ) : (
              <StateBlock empty title="Nothing flagged" description="Every scored store is performing well." />
            )}
          </section>

          <section className="panel" style={{ marginTop: 18 }}>
            <header className="section-head">
              <div>
                <h2 className="section-title">Recent reports</h2>
                <div className="section-kicker">Latest submissions across the region</div>
              </div>
            </header>
            {data?.recentReports?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Store</th>
                      <th>Shopper</th>
                      <th>Submitted</th>
                      <th>Score</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentReports.map((report) => (
                      <tr key={report.id}>
                        <td>
                          <span className="primary-cell">Report #{report.id}</span>
                          <span className="secondary-cell mono">Task #{report.taskId}</span>
                        </td>
                        <td>{report.storeName}</td>
                        <td>{report.shopperName ?? '—'}</td>
                        <td>{formatDateTime(report.submittedAt)}</td>
                        <td>{formatScore(report.score)}</td>
                        <td>
                          <Status value={report.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StateBlock empty title="No reports yet" description="Submitted reports appear here." />
            )}
          </section>
        </>
      )}
    </>
  );
}

function ScorecardsPage() {
  const [search, setSearch] = useState('');
  const scorecards = useGetRegionalScorecards({ search: search || undefined });
  const rows = scorecards.data ?? [];

  return (
    <>
      <PageHeading
        kicker="Regional performance"
        title="Store scorecards"
        description="Approved visit performance for every store in your region."
        action={<ExportButton dataset="scorecards" label="Export scorecards CSV" />}
      />
      <section className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={15} />
            <input
              className="field"
              aria-label="Search stores"
              placeholder="Search store, code or city"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {scorecards.isLoading ? (
          <StateBlock loading />
        ) : scorecards.isError ? (
          <StateBlock error onRetry={() => scorecards.refetch()} />
        ) : !rows.length ? (
          <StateBlock
            empty
            title="No stores scored yet"
            description="Scorecards appear once approved reports exist for stores in your region."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>City</th>
                  <th>Approved visits</th>
                  <th>Average score</th>
                  <th>Last visit</th>
                  <th>Last score</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((card: StoreScorecard) => (
                  <tr key={card.storeId} data-testid={`row-scorecard-${card.storeId}`}>
                    <td>
                      <span className="primary-cell">{card.storeName}</span>
                      <span className="secondary-cell mono">{card.storeCode}</span>
                    </td>
                    <td>{card.city}</td>
                    <td>{card.visits}</td>
                    <td>
                      <ScoreBadge value={card.averageScore} />
                    </td>
                    <td>{card.lastVisitDate ? formatDate(card.lastVisitDate) : '—'}</td>
                    <td>{formatScore(card.lastScore)}</td>
                    <td>
                      <TrendCell value={card.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ComparisonPage() {
  const comparison = useGetRegionalComparison();
  const data = comparison.data;
  const chartData = useMemo(
    () =>
      (data?.scorecards ?? [])
        .filter((card) => card.averageScore != null)
        .map((card) => ({
          name: card.storeName.length > 18 ? `${card.storeName.slice(0, 17)}…` : card.storeName,
          score: card.averageScore as number,
        }))
        .sort((a, b) => b.score - a.score),
    [data?.scorecards],
  );

  return (
    <>
      <PageHeading
        kicker="Regional performance"
        title="Comparisons"
        description="Compare stores in your region against each other and the network average."
        action={<ExportButton dataset="scorecards" label="Export CSV" />}
      />
      {comparison.isLoading ? (
        <div className="panel">
          <StateBlock loading />
        </div>
      ) : comparison.isError ? (
        <div className="panel">
          <StateBlock error onRetry={() => comparison.refetch()} />
        </div>
      ) : (
        <>
          <section className="report-summary">
            <article className="panel report-metric">
              <span>Regional average</span>
              <strong>{data?.averageScore != null ? `${data.averageScore}%` : '—'}</strong>
            </article>
            <article className="panel report-metric">
              <span>Network average</span>
              <strong>{data?.networkAverageScore != null ? `${data.networkAverageScore}%` : '—'}</strong>
            </article>
            <article className="panel report-metric">
              <span>Stores compared</span>
              <strong>{data?.stores ?? 0}</strong>
            </article>
            <article className="panel report-metric">
              <span>Approved visits</span>
              <strong>{data?.visits ?? 0}</strong>
            </article>
          </section>
          <section className="panel">
            <header className="section-head">
              <div>
                <h2 className="section-title">Store comparison</h2>
                <div className="section-kicker">Approved averages per store</div>
              </div>
            </header>
            {chartData.length ? (
              <div className="chart-box">
                <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 42)}>
                  <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#8b9495' }}
                      stroke="#dfe4e7"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      tick={{ fontSize: 11, fill: '#5c6868' }}
                      stroke="#dfe4e7"
                    />
                    <Tooltip formatter={(value: number | string) => [`${value}%`, 'Average score']} />
                    <Bar dataKey="score" radius={[0, 5, 5, 0]} barSize={18}>
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.score >= 80 ? CHART_GREEN : entry.score >= 60 ? CHART_BLUE : CHART_AMBER}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <StateBlock
                empty
                title="Nothing to compare yet"
                description="Stores need at least one approved report with a score."
              />
            )}
          </section>
          {data?.bottomStore && (
            <div className="notice" style={{ marginTop: 16 }}>
              <TrendingDown size={16} />
              <p>
                Lowest scoring store: <strong>{data.bottomStore.storeName}</strong> at{' '}
                {formatScore(data.bottomStore.averageScore)}. Consider scheduling a follow-up visit.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}

function TrendsPage() {
  const [months, setMonths] = useState(6);
  const trends = useGetRegionalTrends({ months });
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const data = useMemo(
    () => (trends.data ?? []).map((point) => ({ ...point, label: formatMonthLabel(point.month) })),
    [trends.data],
  );

  return (
    <>
      <PageHeading
        kicker="Regional performance"
        title="Performance trends"
        description="Monthly average score and approved report volume for your region."
        action={<ExportButton dataset="trends" from={from || undefined} to={to || undefined} label="Export CSV" />}
      />
      <section className="panel">
        <div className="toolbar">
          <select
            className="select"
            aria-label="Number of months"
            style={{ width: 200 }}
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
          >
            {[3, 6, 12, 24].map((value) => (
              <option key={value} value={value}>
                Last {value} months
              </option>
            ))}
          </select>
          <div className="date-filter">
            <CalendarDays size={14} />
            <input
              aria-label="From date"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="date-filter">
            <span>to</span>
            <input aria-label="To date" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        {trends.isLoading ? (
          <StateBlock loading />
        ) : trends.isError ? (
          <StateBlock error onRetry={() => trends.refetch()} />
        ) : (
          <>
            <div className="chart-box">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data} margin={{ top: 16, right: 24, bottom: 4, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8b9495' }} stroke="#dfe4e7" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#8b9495' }} stroke="#dfe4e7" />
                  <Tooltip
                    formatter={(value: number | string, name: string) => [
                      name === 'averageScore' ? `${value ?? 0}%` : value ?? 0,
                      name === 'averageScore' ? 'Average score' : 'Approved reports',
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="averageScore"
                    stroke={CHART_BLUE}
                    strokeWidth={2.6}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line type="monotone" dataKey="reports" stroke={CHART_GREEN} strokeWidth={1.8} strokeDasharray="4 4" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Approved reports</th>
                    <th>Average score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((point) => (
                    <tr key={point.month}>
                      <td>{point.label}</td>
                      <td>{point.reports}</td>
                      <td>{formatScore(point.averageScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}

export function RegionalWorkspace({
  view,
}: {
  view: 'dashboard' | 'scorecards' | 'comparison' | 'trends';
}) {
  const { message } = useNotify();
  if (view === 'scorecards') return <ScorecardsPage />;
  if (view === 'comparison') return <ComparisonPage />;
  if (view === 'trends') return <TrendsPage />;
  return (
    <>
      <RegionalDashboard />
      <Toast message={message} />
    </>
  );
}
