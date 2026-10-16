import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileQuestion,
  Filter,
  ImageIcon,
  Search,
} from 'lucide-react';
import {
  getGetReviewQueueQueryKey,
  getGetSubmissionQueryKey,
  getGetSubmissionsQueryKey,
  useDecideReview,
  useGetSubmission,
  useGetSubmissions,
} from '@workspace/api-client-react';
import type { SubmissionDetail, SubmissionSummary } from '@workspace/api-client-react';
import {
  DetailItem,
  Modal,
  PageHeading,
  StateBlock,
  Status,
  Toast,
  messageOf,
  useNotify,
} from '@/components/common';
import { formatDate, formatDateTime, formatScore } from '@/lib/format';
import { useAuth } from '@/lib/auth';

const REPORT_PAGE_SIZE = 10;

export function canReview(role?: string | null): boolean {
  return role === 'admin' || role === 'reviewer';
}

function downloadEvidence(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ReviewPanel({
  submission,
  onDone,
}: {
  submission: SubmissionDetail;
  onDone: (message: string) => void;
}) {
  const decide = useDecideReview();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>(submission.status);
  const [comment, setComment] = useState(submission.reviewerComment ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const submit = () => {
    setError('');
    setSaved('');
    if (
      (status === 'rejected' || status === 'needs_correction') &&
      !comment.trim()
    ) {
      setError('A reviewer comment is required for this outcome.');
      return;
    }
    decide.mutate(
      {
        submissionId: submission.id,
        data: {
          status: status as 'under_review' | 'approved' | 'rejected' | 'needs_correction',
          comment: comment.trim() || null,
        },
      },
      {
        onSuccess: (updated) => {
          qc.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetSubmissionQueryKey(submission.id) });
          qc.invalidateQueries({ queryKey: getGetReviewQueueQueryKey() });
          setSaved(`Review saved — report is now ${updated.status.replaceAll('_', ' ')}.`);
          onDone(`Report #${submission.id} updated.`);
        },
        onError: (reason) => setError(messageOf(reason)),
      },
    );
  };

  return (
    <section className="report-review-section">
      <div className="report-detail-heading">
        <div>
          <h3>Review outcome</h3>
          <p>Choose an outcome and leave a note for the task record.</p>
        </div>
      </div>
      <label className="form-field">
        <span className="form-label">Outcome</span>
        <select
          className="select"
          data-testid="select-review-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="under_review">Under review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="needs_correction">Needs correction</option>
        </select>
      </label>
      <label className="form-field report-comment">
        <span className="form-label">
          Reviewer comment
          {status === 'rejected' || status === 'needs_correction' ? ' *' : ''}
        </span>
        <textarea
          className="textarea"
          data-testid="textarea-review-comment"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Add context for this review"
        />
      </label>
      {error && (
        <p className="field-error" role="alert" data-testid="text-review-error">
          {error}
        </p>
      )}
      {saved && (
        <p className="review-success" role="status" data-testid="text-review-success">
          <CheckCircle2 size={15} />
          {saved}
        </p>
      )}
      <div className="form-footer">
        <button
          className="btn btn-primary"
          type="button"
          onClick={submit}
          disabled={decide.isPending}
          data-testid="button-save-review"
        >
          {decide.isPending ? 'Saving review…' : 'Save review'}
        </button>
      </div>
    </section>
  );
}

/** Loads the full report (answers + evidence) before showing it. */
function ReportDetailModal({
  submissionId,
  fallback,
  onClose,
  onDone,
}: {
  submissionId: number;
  fallback?: SubmissionSummary;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const detail = useGetSubmission(submissionId);

  if (detail.isLoading) {
    return (
      <Modal title={`Report #${submissionId}`} onClose={onClose} width="820px">
        <StateBlock loading />
      </Modal>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Modal title={`Report #${submissionId}`} onClose={onClose} width="820px">
        <StateBlock
          error
          title="Report unavailable"
          description={
            fallback
              ? 'This report could not be loaded in full. It may have been removed.'
              : 'This report could not be loaded.'
          }
          onRetry={() => detail.refetch()}
        />
      </Modal>
    );
  }

  return <ReportDetail submission={detail.data} onClose={onClose} onDone={onDone} />;
}

function ReportDetail({
  submission,
  onClose,
  onDone,
}: {
  submission: SubmissionDetail;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { user } = useAuth();
  const reviewable = canReview(user?.role) && ['submitted', 'under_review'].includes(submission.status);
  return (
    <Modal
      title={`Report #${submission.id}`}
      subtitle={`${submission.storeName} · ${submission.storeRegion}`}
      onClose={onClose}
      width="820px"
    >
      <div className="report-detail">
        <section className="report-detail-section">
          <div className="report-detail-heading">
            <div>
              <h3>Visit details</h3>
              <p>Operational information recorded for this visit.</p>
            </div>
            <Status value={submission.status} />
          </div>
          <div className="detail-list report-detail-list">
            <DetailItem
              label="Store"
              value={
                <>
                  {submission.storeName}
                  <span className="secondary-cell mono">{submission.storeCode}</span>
                </>
              }
            />
            <DetailItem label="Shopper" value={submission.shopperName || 'Unassigned'} />
            <DetailItem label="Visit date" value={formatDate(submission.visitDate)} />
            <DetailItem label="Due date" value={formatDate(submission.dueDate)} />
            <DetailItem
              label="Submitted"
              value={
                submission.submittedAt ? formatDateTime(submission.submittedAt) : 'Not submitted yet'
              }
            />
            <DetailItem label="Score" value={formatScore(submission.score)} />
            <DetailItem
              label="Reviewed"
              value={
                submission.reviewedAt
                  ? `${formatDateTime(submission.reviewedAt)}${submission.reviewerName ? ` · ${submission.reviewerName}` : ''}`
                  : 'Not reviewed'
              }
            />
            <DetailItem label="Questionnaire" value={submission.questionnaireTitle || 'Not attached'} />
          </div>
          <div className="report-copy-block">
            <label>Visit instructions</label>
            <p>{submission.instructions || 'No instructions recorded.'}</p>
          </div>
          {submission.comment && (
            <div className="report-copy-block">
              <label>Shopper comment</label>
              <p>{submission.comment}</p>
            </div>
          )}
        </section>

        <section className="report-detail-section">
          <div className="report-detail-heading">
            <div>
              <h3>Questionnaire answers</h3>
              <p>{submission.questions.length} recorded responses.</p>
            </div>
          </div>
          {submission.questions.length ? (
            <div className="answer-list">
              {submission.questions.map((question, index) => (
                <div className="answer-row" key={question.id}>
                  <div className="answer-prompt">
                    <span className="question-num">{String(index + 1).padStart(2, '0')}</span>
                    <span>{question.prompt}</span>
                  </div>
                  <div className="answer-value">
                    {question.type === 'rating' ? (
                      <span className="rating-value">
                        {question.valueNumber != null ? `${question.valueNumber} / 5` : '—'}
                      </span>
                    ) : question.type === 'yes_no' ? (
                      question.valueBoolean == null ? (
                        '—'
                      ) : question.valueBoolean ? (
                        'Yes'
                      ) : (
                        'No'
                      )
                    ) : question.valueText ? (
                      question.valueText
                    ) : (
                      <span className="not-recorded">Not answered</span>
                    )}
                  </div>
                  <div className="answer-meta">
                    {question.type.replaceAll('_', ' ')}
                    {question.required ? ' · Required' : ' · Optional'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="page-desc">This visit has no questionnaire attached.</p>
          )}
        </section>

        <section className="report-detail-section">
          <div className="report-detail-heading">
            <div>
              <h3>Evidence</h3>
              <p>{submission.evidence.length} photo(s) attached by the shopper.</p>
            </div>
          </div>
          {submission.evidence.length ? (
            <div className="evidence-grid">
              {submission.evidence.map((item) => (
                <figure className="evidence-card" key={item.id}>
                  <img src={item.url} alt={item.caption || item.fileName} loading="lazy" />
                  <figcaption>
                    <strong>{item.fileName}</strong>
                    <span>{Math.max(1, Math.round(item.byteSize / 1024))} KB · {formatDate(item.createdAt)}</span>
                    {item.caption && <span>{item.caption}</span>}
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => downloadEvidence(item.url, item.fileName)}
                    >
                      <Download size={13} /> Download
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <div className="notice report-unavailable" data-testid="report-content-unavailable">
              <ImageIcon size={16} />
              <p>No evidence photos were attached to this report.</p>
            </div>
          )}
        </section>

        {reviewable ? (
          <ReviewPanel submission={submission} onDone={onDone} />
        ) : (
          <>
            {submission.reviewerComment && (
              <div className="report-copy-block">
                <label>Reviewer comment</label>
                <p>{submission.reviewerComment}</p>
              </div>
            )}
            {!canReview(user?.role) && (
              <div className="notice report-unavailable">
                <FileQuestion size={16} />
                <p>Your role can inspect reports but cannot record a review decision.</p>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

export function ReportsPage() {
  const { user } = useAuth();
  const submissions = useGetSubmissions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [store, setStore] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { message: toast, notify } = useNotify();

  const reports = useMemo(() => submissions.data ?? [], [submissions.data]);
  const stores = useMemo(
    () => Array.from(new Set(reports.map((report) => report.storeName).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [reports],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return reports.filter((report) => {
      const matchesTerm =
        !term ||
        String(report.id).includes(term) ||
        report.storeName.toLowerCase().includes(term) ||
        (report.shopperName || '').toLowerCase().includes(term);
      const submitted = report.submittedAt?.slice(0, 10) || '';
      return (
        matchesTerm &&
        (!status || report.status === status) &&
        (!store || report.storeName === store) &&
        (!fromDate || (submitted && submitted >= fromDate)) &&
        (!toDate || (submitted && submitted <= toDate))
      );
    });
  }, [reports, search, status, store, fromDate, toDate]);

  const pageCount = Math.ceil(filtered.length / REPORT_PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const visible = filtered.slice(currentPage * REPORT_PAGE_SIZE, (currentPage + 1) * REPORT_PAGE_SIZE);
  const selectedSummary: SubmissionSummary | undefined = selectedId
    ? reports.find((report) => report.id === selectedId)
    : undefined;

  const summary = [
    { label: 'Total reports', value: reports.length, key: 'all' },
    {
      label: 'Pending reviews',
      value: reports.filter((report) => report.status === 'submitted' || report.status === 'under_review').length,
      key: 'review',
    },
    { label: 'Approved reports', value: reports.filter((report) => report.status === 'approved').length, key: 'approved' },
    {
      label: 'Rejected or correction-requested',
      value: reports.filter((report) => report.status === 'rejected' || report.status === 'needs_correction').length,
      key: 'followup',
    },
  ];

  const exportCsv = () => {
    const header = [
      'Report',
      'Store',
      'Code',
      'Region',
      'Shopper',
      'Visit date',
      'Submitted',
      'Score',
      'Status',
      'Reviewer',
      'Reviewer comment',
    ];
    const lines = filtered.map((report) =>
      [
        report.id,
        report.storeName,
        report.storeCode,
        report.storeRegion,
        report.shopperName ?? '',
        report.visitDate,
        report.submittedAt ?? '',
        report.score ?? '',
        report.status,
        report.reviewerName ?? '',
        report.reviewerComment ?? '',
      ]
        .map((value) => {
          const text = String(value ?? '').replaceAll('"', '""');
          return /[",\n]/.test(text) ? `"${text}"` : text;
        })
        .join(','),
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reports-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify(`Exported ${filtered.length} reports.`);
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setStore('');
    setFromDate('');
    setToDate('');
    setPage(0);
  };

  return (
    <>
      <PageHeading
        kicker="Visit outcomes"
        title="Reports"
        description={
          user?.role === 'regional_executive'
            ? `Submitted reports for stores in ${user.region ?? 'your region'}.`
            : 'Inspect submitted reports, evidence and recorded review decisions.'
        }
        action={
          <button className="btn btn-sm" type="button" onClick={exportCsv} disabled={!filtered.length}>
            <Download size={14} /> Export CSV
          </button>
        }
      />
      {submissions.isLoading ? (
        <section className="panel">
          <StateBlock loading />
        </section>
      ) : submissions.isError ? (
        <section className="panel">
          <StateBlock error onRetry={() => submissions.refetch()} />
        </section>
      ) : (
        <>
          <section className="report-summary" aria-label="Report summary">
            {summary.map((item) => (
              <article className="panel report-metric" key={item.key} data-testid={`report-summary-${item.key}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </article>
            ))}
          </section>
          <section className="panel report-panel">
            <div className="toolbar report-toolbar">
              <div className="search-wrap">
                <Search size={15} />
                <input
                  className="field"
                  aria-label="Search reports"
                  data-testid="input-report-search"
                  placeholder="Search report, store or shopper"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <select
                className="select report-select"
                aria-label="Filter reports by status"
                data-testid="select-report-status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All statuses</option>
                {['draft', 'submitted', 'under_review', 'approved', 'rejected', 'needs_correction'].map((value) => (
                  <option value={value} key={value}>
                    {value.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
              <select
                className="select report-select"
                aria-label="Filter reports by store"
                data-testid="select-report-store"
                value={store}
                onChange={(event) => {
                  setStore(event.target.value);
                  setPage(0);
                }}
              >
                <option value="">All stores</option>
                {stores.map((name) => (
                  <option value={name} key={name}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="date-filter">
                <CalendarDays size={14} />
                <input
                  aria-label="Submission date from"
                  data-testid="input-report-date-from"
                  type="date"
                  value={fromDate}
                  onChange={(event) => {
                    setFromDate(event.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <div className="date-filter">
                <span>to</span>
                <input
                  aria-label="Submission date to"
                  data-testid="input-report-date-to"
                  type="date"
                  value={toDate}
                  onChange={(event) => {
                    setToDate(event.target.value);
                    setPage(0);
                  }}
                />
              </div>
              <button
                className="btn btn-sm btn-quiet report-clear"
                type="button"
                onClick={clearFilters}
                data-testid="button-clear-report-filters"
              >
                Clear filters
              </button>
            </div>
            {!reports.length ? (
              <StateBlock
                empty
                title="No reports yet"
                description="Reports appear here once a shopper submits a visit for review."
              />
            ) : !filtered.length ? (
              <div className="report-no-results" data-testid="report-no-results">
                <div className="state-icon">
                  <Filter size={18} />
                </div>
                <h3>No matching reports</h3>
                <p>Adjust or clear the filters to see more submitted records.</p>
                <button className="btn btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Report</th>
                        <th>Store</th>
                        <th>Shopper</th>
                        <th>Visit date</th>
                        <th>Submitted</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((report: SubmissionSummary) => (
                        <tr key={report.id} data-testid={`row-report-${report.id}`}>
                          <td>
                            <span className="primary-cell">Report #{report.id}</span>
                            <span className="secondary-cell mono">Task #{report.taskId}</span>
                          </td>
                          <td>
                            <span className="primary-cell">{report.storeName}</span>
                            <span className="secondary-cell mono">{report.storeCode}</span>
                          </td>
                          <td>{report.shopperName || 'Unassigned'}</td>
                          <td>{formatDate(report.visitDate)}</td>
                          <td>
                            {report.submittedAt ? (
                              formatDateTime(report.submittedAt)
                            ) : (
                              <span className="not-recorded">Draft</span>
                            )}
                          </td>
                          <td>
                            <span data-testid={`status-report-${report.id}`}>
                              <Status value={report.status} />
                            </span>
                          </td>
                          <td>{formatScore(report.score)}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => setSelectedId(report.id)}
                              data-testid={`button-inspect-task-${report.id}`}
                            >
                              <Eye size={14} /> Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination report-pagination" data-testid="report-pagination">
                  <span>
                    Showing {filtered.length ? currentPage * REPORT_PAGE_SIZE + 1 : 0}–
                    {Math.min((currentPage + 1) * REPORT_PAGE_SIZE, filtered.length)} of {filtered.length} reports
                  </span>
                  {pageCount > 1 && (
                    <div className="report-page-controls">
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={currentPage === 0}
                        onClick={() => setPage((value) => Math.max(0, value - 1))}
                        data-testid="button-report-previous"
                      >
                        Previous
                      </button>
                      <span>
                        Page {currentPage + 1} of {pageCount}
                      </span>
                      <button
                        className="btn btn-sm"
                        type="button"
                        disabled={currentPage >= pageCount - 1}
                        onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
                        data-testid="button-report-next"
                      >
                        Next
                      </button>
                    </div>
                  )}
                  <span>Submission date filters exclude drafts without a submission time.</span>
                </div>
              </>
            )}
          </section>
        </>
      )}
      {selectedId != null && (
        <ReportDetailModal
          submissionId={selectedId}
          fallback={selectedSummary}
          onClose={() => setSelectedId(null)}
          onDone={(text) => {
            notify(text);
            setSelectedId(null);
          }}
        />
      )}
      <Toast message={toast} />
    </>
  );
}
