import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Eye,
  FileQuestion,
  ImageIcon,
  Search,
  Star,
  XCircle,
} from 'lucide-react';
import {
  getGetReviewHistoryQueryKey,
  getGetReviewOverviewQueryKey,
  getGetReviewQueueQueryKey,
  useDecideReview,
  useGetReviewHistory,
  useGetReviewOverview,
  useGetReviewQueue,
  useGetSubmission,
} from '@workspace/api-client-react';
import type { SubmissionSummary } from '@workspace/api-client-react';
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

function downloadEvidence(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function ReviewModal({
  submissionId,
  onClose,
  onDone,
}: {
  submissionId: number;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const query = useGetSubmission(submissionId, {
    query: { queryKey: ['submission', submissionId], enabled: Number.isFinite(submissionId) },
  });
  const decide = useDecideReview();
  const qc = useQueryClient();
  const submission = query.data;
  const [status, setStatus] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const currentStatus = status || (submission && ['submitted', 'under_review'].includes(submission.status) ? 'under_review' : submission?.status) || 'under_review';

  const submit = () => {
    setError('');
    setSaved('');
    if ((currentStatus === 'rejected' || currentStatus === 'needs_correction') && !comment.trim()) {
      setError('A reviewer comment is required for this outcome.');
      return;
    }
    decide.mutate(
      {
        submissionId,
        data: {
          status: currentStatus as 'under_review' | 'approved' | 'rejected' | 'needs_correction',
          comment: comment.trim() || null,
        },
      },
      {
        onSuccess: (updated) => {
          qc.invalidateQueries({ queryKey: getGetReviewQueueQueryKey() });
          qc.invalidateQueries({ queryKey: getGetReviewHistoryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetReviewOverviewQueryKey() });
          qc.invalidateQueries({ queryKey: ['submission', submissionId] });
          setSaved(`Report is now ${updated.status.replaceAll('_', ' ')}.`);
          onDone(`Report #${submissionId} updated.`);
        },
        onError: (reason) => setError(messageOf(reason)),
      },
    );
  };

  return (
    <Modal
      title={submission ? `Report #${submission.id}` : 'Report'}
      subtitle={submission ? `${submission.storeName} · ${submission.shopperName ?? 'Unassigned'}` : 'Loading…'}
      onClose={onClose}
      width="820px"
    >
      {query.isLoading ? (
        <StateBlock loading />
      ) : query.isError ? (
        <StateBlock error onRetry={() => query.refetch()} />
      ) : submission ? (
        <div className="report-detail">
          <section className="report-detail-section">
            <div className="report-detail-heading">
              <div>
                <h3>Visit details</h3>
                <p>Everything recorded by the shopper for this visit.</p>
              </div>
              <Status value={submission.status} />
            </div>
            <div className="detail-list report-detail-list">
              <DetailItem label="Store" value={submission.storeName} />
              <DetailItem label="Shopper" value={submission.shopperName ?? 'Unassigned'} />
              <DetailItem label="Visit date" value={formatDate(submission.visitDate)} />
              <DetailItem label="Submitted" value={formatDateTime(submission.submittedAt)} />
              <DetailItem label="Score" value={formatScore(submission.score)} />
              <DetailItem label="Questionnaire" value={submission.questionnaireTitle ?? 'Not attached'} />
            </div>
            <div className="report-copy-block">
              <label>Visit instructions</label>
              <p>{submission.instructions || 'No instructions recorded.'}</p>
            </div>
            <div className="report-copy-block">
              <label>Shopper comment</label>
              <p>{submission.comment || 'No comment recorded.'}</p>
            </div>
          </section>

          <section className="report-detail-section">
            <div className="report-detail-heading">
              <div>
                <h3>Answers</h3>
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
                      {question.type === 'rating'
                        ? question.valueNumber != null
                          ? `${question.valueNumber} / 5`
                          : '—'
                        : question.type === 'yes_no'
                          ? question.valueBoolean == null
                            ? '—'
                            : question.valueBoolean
                              ? 'Yes'
                              : 'No'
                          : question.valueText || <span className="not-recorded">Not answered</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="page-desc">No questionnaire was attached to this visit.</p>
            )}
          </section>

          <section className="report-detail-section">
            <div className="report-detail-heading">
              <div>
                <h3>Evidence</h3>
                <p>{submission.evidence.length} photo(s) attached.</p>
              </div>
            </div>
            {submission.evidence.length ? (
              <div className="evidence-grid">
                {submission.evidence.map((item) => (
                  <figure className="evidence-card" key={item.id}>
                    <img src={item.url} alt={item.fileName} loading="lazy" />
                    <figcaption>
                      <strong>{item.fileName}</strong>
                      <span>{Math.max(1, Math.round(item.byteSize / 1024))} KB</span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => downloadEvidence(item.url, item.fileName)}
                      >
                        Download
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="notice report-unavailable">
                <ImageIcon size={16} />
                <p>No evidence photos were attached to this report.</p>
              </div>
            )}
          </section>

          {['submitted', 'under_review'].includes(submission.status) ? (
            <section className="report-review-section">
              <div className="report-detail-heading">
                <div>
                  <h3>Review outcome</h3>
                  <p>Approve to include this report in official store scores.</p>
                </div>
              </div>
              <label className="form-field">
                <span className="form-label">Outcome</span>
                <select
                  className="select"
                  value={currentStatus}
                  onChange={(event) => setStatus(event.target.value)}
                  data-testid="select-review-status"
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
                  {currentStatus === 'rejected' || currentStatus === 'needs_correction' ? ' *' : ''}
                </span>
                <textarea
                  className="textarea"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Explain the decision for the shopper"
                  data-testid="textarea-review-comment"
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
                <button className="btn" type="button" onClick={onClose}>
                  Close
                </button>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={submit}
                  disabled={decide.isPending}
                  data-testid="button-save-review"
                >
                  {decide.isPending ? 'Saving…' : 'Save review'}
                </button>
              </div>
            </section>
          ) : (
            <section className="report-review-section">
              <div className="report-detail-heading">
                <div>
                  <h3>Decision recorded</h3>
                  <p>{submission.reviewerName ? `Reviewed by ${submission.reviewerName}` : 'Reviewed'}</p>
                </div>
                <Status value={submission.status} />
              </div>
              {submission.reviewerComment && (
                <div className="report-copy-block">
                  <label>Reviewer comment</label>
                  <p>{submission.reviewerComment}</p>
                </div>
              )}
              <div className="form-footer">
                <button className="btn" type="button" onClick={onClose}>
                  Close
                </button>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function ReviewerDashboard() {
  const overview = useGetReviewOverview();
  const data = overview.data;
  const { message, notify } = useNotify();
  const [selected, setSelected] = useState<number | null>(null);
  const stats = [
    { title: 'Awaiting review', value: data?.awaitingReview, foot: 'Submitted, not yet opened', icon: Clock3 },
    { title: 'Under review', value: data?.inReview, foot: 'Currently being inspected', icon: ClipboardList },
    { title: 'Approved', value: data?.approved, foot: 'Counted in official scores', icon: CheckCircle2 },
    { title: 'Needs correction', value: data?.needsCorrection, foot: 'Sent back to the shopper', icon: FileQuestion },
    { title: 'Rejected', value: data?.rejected, foot: 'Not counted in scores', icon: XCircle },
    {
      title: 'Average approved score',
      value: data?.averageScore != null ? `${data.averageScore}%` : '—',
      foot: 'Across approved reports',
      icon: Star,
    },
  ];
  return (
    <>
      <PageHeading
        kicker="Quality control"
        title="Review dashboard"
        description="Everything submitted for quality review, and the decisions your team has recorded."
      />
      {overview.isLoading ? (
        <div className="metric-grid">
          {stats.map((stat) => (
            <div className="panel metric-card" key={stat.title}>
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
            {stats.map(({ title, value, foot, icon: Icon }) => (
              <article className="panel metric-card" key={title}>
                <div className="metric-top">
                  <span>{title}</span>
                  <span className="metric-icon">
                    <Icon size={16} />
                  </span>
                </div>
                <div className="metric-value">{value ?? 0}</div>
                <div className="metric-foot">{foot}</div>
              </article>
            ))}
          </section>
          <section className="panel">
            <header className="section-head">
              <div>
                <h2 className="section-title">Recent decisions</h2>
                <div className="section-kicker">Latest reviewed reports</div>
              </div>
            </header>
            {data?.recentDecisions?.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Report</th>
                      <th>Store</th>
                      <th>Shopper</th>
                      <th>Reviewed</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentDecisions.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="primary-cell">Report #{item.id}</span>
                          <span className="secondary-cell mono">Task #{item.taskId}</span>
                        </td>
                        <td>{item.storeName}</td>
                        <td>{item.shopperName ?? '—'}</td>
                        <td>{formatDateTime(item.reviewedAt)}</td>
                        <td>
                          <Status value={item.status} />
                        </td>
                        <td>
                          <button className="btn btn-sm" onClick={() => setSelected(item.id)}>
                            <Eye size={14} /> Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <StateBlock empty title="No decisions yet" description="Reviewed reports will be listed here." />
            )}
          </section>
        </>
      )}
      {selected && (
        <ReviewModal
          submissionId={selected}
          onClose={() => setSelected(null)}
          onDone={(text) => {
            notify(text);
            setSelected(null);
          }}
        />
      )}
      <Toast message={message} />
    </>
  );
}

function QueueTable({ history }: { history: boolean }) {
  const query = history
    ? useGetReviewHistory({})
    : useGetReviewQueue({});
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const { message, notify } = useNotify();

  const rows = useMemo(() => {
    const all = (query.data ?? []) as SubmissionSummary[];
    const term = search.trim().toLowerCase();
    return all.filter((item) => {
      const matchesTerm =
        !term ||
        String(item.id).includes(term) ||
        item.storeName.toLowerCase().includes(term) ||
        (item.shopperName ?? '').toLowerCase().includes(term);
      return matchesTerm && (!status || item.status === status);
    });
  }, [query.data, search, status]);

  return (
    <>
      <PageHeading
        kicker="Quality control"
        title={history ? 'Review history' : 'Review queue'}
        description={
          history
            ? 'Reports that already received an approval, rejection or correction request.'
            : 'Reports submitted by shoppers and waiting for a quality decision.'
        }
      />
      <section className="panel">
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={15} />
            <input
              className="field"
              aria-label="Search reports"
              placeholder="Search report, store or shopper"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select
            className="select"
            aria-label="Filter by status"
            style={{ width: 220 }}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {(history
              ? ['approved', 'rejected', 'needs_correction']
              : ['submitted', 'under_review']
            ).map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        {query.isLoading ? (
          <StateBlock loading />
        ) : query.isError ? (
          <StateBlock error onRetry={() => query.refetch()} />
        ) : !rows.length ? (
          <StateBlock
            empty
            title={history ? 'No reviewed reports' : 'Queue is clear'}
            description={
              history
                ? 'Once you record a decision it appears here.'
                : 'New shopper submissions will appear here for review.'
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Store</th>
                  <th>Shopper</th>
                  <th>{history ? 'Reviewed' : 'Submitted'}</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} data-testid={`row-review-${item.id}`}>
                    <td>
                      <span className="primary-cell">Report #{item.id}</span>
                      <span className="secondary-cell mono">Task #{item.taskId}</span>
                    </td>
                    <td>
                      <span className="primary-cell">{item.storeName}</span>
                      <span className="secondary-cell">{item.storeRegion}</span>
                    </td>
                    <td>{item.shopperName ?? '—'}</td>
                    <td>{formatDateTime(history ? item.reviewedAt : item.submittedAt)}</td>
                    <td>{formatScore(item.score)}</td>
                    <td>
                      <Status value={item.status} />
                    </td>
                    <td>
                      <button
                        className="btn btn-sm"
                        onClick={() => setSelected(item.id)}
                        data-testid={`button-review-${item.id}`}
                      >
                        <Eye size={14} /> {history ? 'Open' : 'Review'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {selected && (
        <ReviewModal
          submissionId={selected}
          onClose={() => setSelected(null)}
          onDone={(text) => {
            notify(text);
            setSelected(null);
          }}
        />
      )}
      <Toast message={message} />
    </>
  );
}

export function ReviewerWorkspace({ view }: { view: 'dashboard' | 'queue' | 'history' }) {
  if (view === 'queue') return <QueueTable history={false} />;
  if (view === 'history') return <QueueTable history />;
  return <ReviewerDashboard />;
}
