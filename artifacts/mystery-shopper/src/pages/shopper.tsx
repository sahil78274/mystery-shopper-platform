import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  Camera,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  ImageIcon,
  Loader2,
  Save,
  Send,
  ShieldCheck,
  Star,
  Trash2,
} from 'lucide-react';
import {
  getGetMySubmissionsQueryKey,
  getGetShopperOverviewQueryKey,
  getGetTasksQueryKey,
  useAddSubmissionEvidence,
  useCreateSubmission,
  useDeleteSubmissionEvidence,
  useGetMySubmissions,
  useGetShopperOverview,
  useGetSubmission,
  useGetTasks,
  useSaveSubmissionDraft,
  useSubmitSubmission,
} from '@workspace/api-client-react';
import type { SubmissionDetail } from '@workspace/api-client-react';
import {
  DetailItem,
  PageHeading,
  StateBlock,
  Status,
  Toast,
  messageOf,
  useNotify,
} from '@/components/common';
import { formatDate, formatDateTime, formatScore } from '@/lib/format';
import { useAuth } from '@/lib/auth';

const OPEN_STATUSES = ['assigned', 'in_progress', 'needs_correction'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

type AnswerValue = { valueText: string; valueNumber: number | null; valueBoolean: boolean | null };

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.readAsDataURL(file);
  });
}

function ShopperDashboard() {
  const overview = useGetShopperOverview();
  const data = overview.data;
  const { user } = useAuth();
  const stats = [
    { title: 'Open assignments', value: data?.openAssignments, foot: 'Visits waiting for a report', icon: ClipboardList },
    { title: 'Drafts in progress', value: data?.draftsInProgress, foot: 'Saved but not submitted', icon: Save },
    {
      title: 'Awaiting review',
      value: data?.awaitingReview,
      foot: 'Submitted, not yet decided',
      icon: Clock3,
    },
    { title: 'Approved', value: data?.approved, foot: 'Reports accepted by reviewers', icon: ClipboardCheck },
    { title: 'Needs correction', value: data?.needsCorrection, foot: 'Sent back for changes', icon: ShieldCheck },
    {
      title: 'Average score',
      value: data?.averageScore != null ? `${data.averageScore}%` : '—',
      foot: 'Across approved reports',
      icon: Star,
    },
  ];

  const pendingVerification = user?.verificationStatus && user.verificationStatus !== 'verified';

  return (
    <>
      <PageHeading
        kicker="My fieldwork"
        title="My dashboard"
        description="Your assignments, saved drafts and the outcome of every report you submit."
        action={
          <Link href="/assignments" className="btn btn-primary">
            My assignments <ArrowUpRight size={14} />
          </Link>
        }
      />
      {pendingVerification && (
        <div className="notice" style={{ marginBottom: 16 }} data-testid="shopper-verification-notice">
          <ShieldCheck size={16} />
          <p>
            Your shopper profile is <strong>{user?.verificationStatus}</strong>. An administrator must verify your
            profile before visits can be assigned to you.
          </p>
        </div>
      )}
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
          <div className="dashboard-grid">
            <section className="panel">
              <header className="section-head">
                <div>
                  <h2 className="section-title">Upcoming visits</h2>
                  <div className="section-kicker">Assigned to you</div>
                </div>
                <Link href="/assignments" className="btn btn-sm">
                  All assignments <ArrowUpRight size={14} />
                </Link>
              </header>
              {data?.upcomingTasks?.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Store</th>
                        <th>Visit date</th>
                        <th>Due date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.upcomingTasks.map((task) => (
                        <tr key={task.id}>
                          <td>
                            <Link className="primary-cell" href={`/assignments/${task.id}`}>
                              {task.storeName}
                              <span className="secondary-cell mono">{task.storeCode}</span>
                            </Link>
                          </td>
                          <td>{formatDate(task.visitDate)}</td>
                          <td>{formatDate(task.dueDate)}</td>
                          <td>
                            <Status value={task.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <StateBlock empty title="No open visits" description="New assignments will appear here." />
              )}
            </section>
            <section className="panel">
              <header className="section-head">
                <div>
                  <h2 className="section-title">Recent submissions</h2>
                  <div className="section-kicker">Your latest report activity</div>
                </div>
              </header>
              {data?.recentSubmissions?.length ? (
                <div className="activity-list">
                  {data.recentSubmissions.map((submission) => (
                    <div className="activity-item" key={submission.id}>
                      <div className="activity-dot">
                        <ClipboardCheck size={13} />
                      </div>
                      <div className="activity-text">
                        <Link href={`/submissions/${submission.id}`}>
                          Report #{submission.id} · {submission.storeName}
                        </Link>
                        <span className="activity-time">
                          <Status value={submission.status} /> {formatDateTime(submission.updatedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <StateBlock empty title="No submissions yet" description="Submit a visit report to see it here." />
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function AssignmentsPage() {
  const tasks = useGetTasks();
  const submissions = useGetMySubmissions();
  const [filter, setFilter] = useState('');
  const submissionByTask = useMemo(() => {
    const map = new Map<number, { id: number; status: string }>();
    (submissions.data ?? []).forEach((item) => map.set(item.taskId, { id: item.id, status: item.status }));
    return map;
  }, [submissions.data]);

  const rows = useMemo(() => {
    const all = tasks.data ?? [];
    if (!filter) return all;
    return all.filter((task) => {
      const submission = submissionByTask.get(task.id);
      const state = submission?.status ?? 'not_started';
      if (filter === 'open') return OPEN_STATUSES.includes(task.status);
      if (filter === 'draft') return state === 'draft';
      if (filter === 'submitted') return ['submitted', 'under_review'].includes(state);
      if (filter === 'decided') return ['approved', 'rejected', 'needs_correction'].includes(state);
      return true;
    });
  }, [tasks.data, filter, submissionByTask]);

  return (
    <>
      <PageHeading
        kicker="My fieldwork"
        title="My assignments"
        description="Every visit assigned to you. Open a task to complete the questionnaire, attach evidence and submit your report."
      />
      <section className="panel">
        <div className="toolbar">
          <select
            className="select"
            aria-label="Filter assignments"
            style={{ width: 220 }}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">All assignments</option>
            <option value="open">Open (assigned, in progress, needs correction)</option>
            <option value="draft">Draft in progress</option>
            <option value="submitted">Submitted for review</option>
            <option value="decided">Reviewed by quality team</option>
          </select>
        </div>
        {tasks.isLoading || submissions.isLoading ? (
          <StateBlock loading />
        ) : tasks.isError ? (
          <StateBlock error onRetry={() => tasks.refetch()} />
        ) : !rows.length ? (
          <StateBlock
            empty
            title="No assignments yet"
            description="Once an administrator assigns a verified shopper profile to a visit, it appears here."
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Visit date</th>
                  <th>Due date</th>
                  <th>Questionnaire</th>
                  <th>Task</th>
                  <th>Report</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((task) => {
                  const submission = submissionByTask.get(task.id);
                  return (
                    <tr key={task.id} data-testid={`row-assignment-${task.id}`}>
                      <td>
                        <span className="primary-cell">{task.storeName}</span>
                        <span className="secondary-cell mono">
                          {task.storeCode} · {task.instructions.slice(0, 60)}
                        </span>
                      </td>
                      <td>{formatDate(task.visitDate)}</td>
                      <td>{formatDate(task.dueDate)}</td>
                      <td>{task.questionnaireTitle || 'None'}</td>
                      <td>
                        <Status value={task.status} />
                      </td>
                      <td>{submission ? <Status value={submission.status} /> : <span className="not-recorded">Not started</span>}</td>
                      <td>
                        <Link className="btn btn-sm" href={`/assignments/${task.id}`}>
                          {OPEN_STATUSES.includes(task.status) ? 'Complete visit' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function AnswerField({
  question,
  value,
  onChange,
}: {
  question: SubmissionDetail['questions'][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
}) {
  const inputId = `question-${question.id}`;
  if (question.type === 'rating') {
    return (
      <div className="rating-input" role="group" aria-label={question.prompt}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            className={`rating-star${value.valueNumber === score ? ' selected' : ''}`}
            aria-label={`${score} out of 5`}
            aria-pressed={value.valueNumber === score}
            onClick={() => onChange({ ...value, valueNumber: score })}
          >
            <Star size={18} />
          </button>
        ))}
        <span className="rating-label">{value.valueNumber ? `${value.valueNumber} / 5` : 'Not scored'}</span>
      </div>
    );
  }
  if (question.type === 'yes_no') {
    return (
      <div className="choice-row" role="group" aria-label={question.prompt}>
        {[
          { label: 'Yes', value: true },
          { label: 'No', value: false },
        ].map((option) => (
          <button
            key={option.label}
            type="button"
            className={`choice-button${value.valueBoolean === option.value ? ' selected' : ''}`}
            aria-pressed={value.valueBoolean === option.value}
            onClick={() => onChange({ ...value, valueBoolean: option.value })}
          >
            {option.label}
          </button>
        ))}
      </div>
    );
  }
  if (question.type === 'single_choice') {
    return (
      <select
        id={inputId}
        className="select"
        value={value.valueText}
        onChange={(event) => onChange({ ...value, valueText: event.target.value })}
      >
        <option value="">Select an option</option>
        {question.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  return (
    <textarea
      id={inputId}
      className="textarea"
      value={value.valueText}
      placeholder="Write what you observed"
      onChange={(event) => onChange({ ...value, valueText: event.target.value })}
    />
  );
}

function AssignmentDetail({ taskId }: { taskId: number }) {
  const qc = useQueryClient();
  const { message, notify } = useNotify();
  const start = useCreateSubmission();
  const tasks = useGetTasks();
  const submissions = useGetMySubmissions();
  const task = (tasks.data ?? []).find((item) => item.id === taskId);
  const existingId = (submissions.data ?? []).find((item) => item.taskId === taskId)?.id ?? null;

  const submissionQuery = useGetSubmission(existingId ?? 0, {
    query: { enabled: Boolean(existingId), queryKey: ['submission', existingId] },
  });
  const detail = existingId ? submissionQuery.data : undefined;
  const saveDraft = useSaveSubmissionDraft();
  const submitReport = useSubmitSubmission();
  const addEvidence = useAddSubmissionEvidence();
  const removeEvidence = useDeleteSubmissionEvidence();

  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [hydratedFor, setHydratedFor] = useState<number | null>(null);

  useEffect(() => {
    if (detail && hydratedFor !== detail.id) {
      const next: Record<number, AnswerValue> = {};
      detail.questions.forEach((question) => {
        next[question.questionId ?? question.id] = {
          valueText: question.valueText ?? '',
          valueNumber: question.valueNumber ?? null,
          valueBoolean: question.valueBoolean ?? null,
        };
      });
      setAnswers(next);
      setComment(detail.comment ?? '');
      setHydratedFor(detail.id);
    }
  }, [detail, hydratedFor]);

  const beginReport = useCallback(() => {
    setError('');
    setStarting(true);
    start.mutate(
      { data: { taskId } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetMySubmissionsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetTasksQueryKey() });
          notify('Report started. Save a draft at any time.');
        },
        onError: (reason) => setError(messageOf(reason)),
        onSettled: () => setStarting(false),
      },
    );
  }, [start, qc, notify, taskId]);

  const answersPayload = useMemo(
    () =>
      Object.entries(answers).map(([questionId, value]) => ({
        questionId: Number(questionId),
        valueText: value.valueText || null,
        valueNumber: value.valueNumber,
        valueBoolean: value.valueBoolean,
      })),
    [answers],
  );

  const persist = (submit: boolean) => {
    if (!existingId) return;
    setError('');
    const payload = { comment: comment.trim() || null, answers: answersPayload };
    const onSuccess = (updated: SubmissionDetail) => {
      qc.invalidateQueries({ queryKey: getGetMySubmissionsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetTasksQueryKey() });
      qc.invalidateQueries({ queryKey: getGetShopperOverviewQueryKey() });
      qc.setQueryData(['submission', existingId], updated);
      notify(submit ? 'Report submitted for review.' : 'Draft saved.');
    };
    const onError = (reason: unknown) => setError(messageOf(reason));
    if (submit) {
      submitReport.mutate({ submissionId: existingId, data: payload }, { onSuccess, onError });
    } else {
      saveDraft.mutate({ submissionId: existingId, data: payload }, { onSuccess, onError });
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!existingId) return;
    setError('');
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Photos must be 5 MB or smaller.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Only image files can be attached as evidence.');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const base64 = dataUrl.split(',').pop() ?? '';
      addEvidence.mutate(
        {
          submissionId: existingId,
          data: { fileName: file.name, mimeType: file.type || 'image/jpeg', data: base64, caption: null },
        },
        {
          onSuccess: (updated) => {
            qc.setQueryData(['submission', existingId], updated);
            qc.invalidateQueries({ queryKey: getGetMySubmissionsQueryKey() });
            notify('Photo attached.');
          },
          onError: (reason) => setError(messageOf(reason)),
          onSettled: () => setUploading(false),
        },
      );
    } catch (reason) {
      setError(messageOf(reason));
      setUploading(false);
    }
  };

  const removePhoto = (evidenceId: number) => {
    if (!existingId) return;
    removeEvidence.mutate(
      { submissionId: existingId, evidenceId },
      {
        onSuccess: (updated) => {
          qc.setQueryData(['submission', existingId], updated);
          notify('Photo removed.');
        },
        onError: (reason) => setError(messageOf(reason)),
      },
    );
  };

  const editable = Boolean(detail?.canEdit);

  return (
    <>
      <PageHeading
        kicker="Assigned visit"
        title={task?.storeName ?? 'Assignment'}
        description={
          task
            ? `Task #${task.id} · Visit ${formatDate(task.visitDate)} · Due ${formatDate(task.dueDate)}`
            : 'Loading assignment details…'
        }
        action={
          <Link href="/assignments" className="btn">
            <ArrowLeft size={14} /> Back to assignments
          </Link>
        }
      />
      {!task ? (
        <div className="panel">
          <StateBlock
            loading={tasks.isLoading}
            error={tasks.isError}
            onRetry={() => tasks.refetch()}
            title="Assignment not found"
            description="This visit is not assigned to your shopper profile."
          />
        </div>
      ) : (
        <div className="detail-layout">
          <section className="panel detail-main">
            <h2 className="section-title">Visit brief</h2>
            <div className="section-kicker" style={{ marginBottom: 16 }}>
              Instructions from the operations team
            </div>
            <div className="detail-list">
              <DetailItem label="Store" value={task.storeName} />
              <DetailItem label="Store code" value={task.storeCode} mono />
              <DetailItem label="Visit date" value={formatDate(task.visitDate)} />
              <DetailItem label="Due date" value={formatDate(task.dueDate)} />
              <DetailItem label="Priority" value={<Status value={task.priority} />} />
              <DetailItem label="Task status" value={<Status value={task.status} />} />
              <DetailItem label="Questionnaire" value={task.questionnaireTitle || 'None attached'} full />
            </div>
            <div className="report-copy-block">
              <label>Instructions</label>
              <p>{task.instructions || 'No instructions recorded.'}</p>
            </div>
          </section>

          <aside className="panel detail-side">
            <h2 className="section-title">Report status</h2>
            <div className="section-kicker" style={{ marginBottom: 14 }}>
              {detail ? `Report #${detail.id}` : 'Not started'}
            </div>
            {detail ? (
              <>
                <Status value={detail.status} />
                <div style={{ marginTop: 14 }}>
                  <DetailItem label="Score" value={formatScore(detail.score)} />
                </div>
                <div style={{ marginTop: 14 }}>
                  <DetailItem label="Evidence" value={`${detail.evidenceCount} photo(s)`} />
                </div>
                {detail.reviewerComment && (
                  <div className="report-copy-block">
                    <label>Reviewer feedback</label>
                    <p>{detail.reviewerComment}</p>
                  </div>
                )}
              </>
            ) : (
              <button className="btn btn-primary" onClick={beginReport} disabled={starting}>
                {starting ? 'Starting…' : 'Start report'}
              </button>
            )}
          </aside>
        </div>
      )}

      {detail && (
        <section className="panel" style={{ marginTop: 18 }}>
          <header className="section-head">
            <div>
              <h2 className="section-title">Questionnaire</h2>
              <div className="section-kicker">
                {detail.questionnaireTitle ?? 'Visit questions'}
                {!editable ? ' · read only' : ''}
              </div>
            </div>
            <Status value={detail.status} />
          </header>
          {detail.questions.length ? (
            <div className="answer-form">
              {detail.questions.map((question, index) => {
                const key = question.questionId ?? question.id;
                return (
                  <div className="answer-field" key={question.id}>
                    <label htmlFor={`question-${question.id}`}>
                      <span className="question-num">{String(index + 1).padStart(2, '0')}</span>
                      {question.prompt}
                      {question.required && <em>Required</em>}
                    </label>
                    <AnswerField
                      question={question}
                      value={answers[key] ?? { valueText: '', valueNumber: null, valueBoolean: null }}
                      onChange={(next) => setAnswers((current) => ({ ...current, [key]: next }))}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="page-desc" style={{ padding: '0 20px 20px' }}>
              This visit has no questionnaire attached. Add your observations to the comment below.
            </p>
          )}

          <div className="report-form-section">
            <label className="form-field">
              <span className="form-label">Visit comment *</span>
              <textarea
                className="textarea"
                value={comment}
                disabled={!editable}
                placeholder="Summarise the visit, staff interaction and anything unusual"
                onChange={(event) => setComment(event.target.value)}
                data-testid="input-shopper-comment"
              />
            </label>
          </div>

          <div className="report-form-section">
            <div className="evidence-head">
              <div>
                <h3 className="section-title">Evidence photos</h3>
                <div className="section-kicker">
                  {detail.evidenceCount} attached · JPEG, PNG, WebP or HEIC up to 5 MB
                </div>
              </div>
              <button
                className="btn btn-sm"
                type="button"
                disabled={!editable || uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? <Loader2 size={14} className="spin" /> : <Camera size={14} />}
                {uploading ? 'Uploading…' : 'Add photo'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="visually-hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void uploadPhoto(file);
                }}
              />
            </div>
            {detail.evidence.length ? (
              <div className="evidence-grid">
                {detail.evidence.map((item) => (
                  <figure className="evidence-card" key={item.id}>
                    <img src={item.url} alt={item.fileName} loading="lazy" />
                    <figcaption>
                      <strong>{item.fileName}</strong>
                      <span>{Math.max(1, Math.round(item.byteSize / 1024))} KB</span>
                      {editable && (
                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          onClick={() => removePhoto(item.id)}
                          disabled={removeEvidence.isPending}
                        >
                          <Trash2 size={13} /> Remove
                        </button>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <div className="notice report-unavailable">
                <ImageIcon size={16} />
                <p>No evidence photos yet. At least one photo is required before submitting.</p>
              </div>
            )}
          </div>

          {error && (
            <p className="field-error" role="alert" style={{ padding: '0 20px 16px' }}>
              {error}
            </p>
          )}

          {editable && (
            <div className="detail-actions" style={{ padding: '0 20px 20px' }}>
              <button
                className="btn"
                type="button"
                onClick={() => persist(false)}
                disabled={saveDraft.isPending}
                data-testid="button-save-draft"
              >
                <Save size={14} /> {saveDraft.isPending ? 'Saving…' : 'Save draft'}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => persist(true)}
                disabled={submitReport.isPending}
                data-testid="button-submit-report"
              >
                <Send size={14} /> {submitReport.isPending ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          )}
        </section>
      )}
      <Toast message={message} />
    </>
  );
}

function SubmissionHistory() {
  const submissions = useGetMySubmissions();
  const [status, setStatus] = useState('');
  const rows = useMemo(() => {
    const all = submissions.data ?? [];
    return status ? all.filter((item) => item.status === status) : all;
  }, [submissions.data, status]);

  return (
    <>
      <PageHeading
        kicker="My fieldwork"
        title="Submission history"
        description="Every report you started, saved or submitted — with the reviewer's decision."
      />
      <section className="panel">
        <div className="toolbar">
          <select
            className="select"
            aria-label="Filter by status"
            style={{ width: 220 }}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {['draft', 'submitted', 'under_review', 'approved', 'rejected', 'needs_correction'].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </div>
        {submissions.isLoading ? (
          <StateBlock loading />
        ) : submissions.isError ? (
          <StateBlock error onRetry={() => submissions.refetch()} />
        ) : !rows.length ? (
          <StateBlock empty title="No submissions yet" description="Complete an assignment to create your first report." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Store</th>
                  <th>Visit date</th>
                  <th>Submitted</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((submission) => (
                  <tr key={submission.id} data-testid={`row-submission-${submission.id}`}>
                    <td>
                      <span className="primary-cell">Report #{submission.id}</span>
                      <span className="secondary-cell mono">Task #{submission.taskId}</span>
                    </td>
                    <td>
                      <span className="primary-cell">{submission.storeName}</span>
                      <span className="secondary-cell">{submission.storeRegion}</span>
                    </td>
                    <td>{formatDate(submission.visitDate)}</td>
                    <td>{submission.submittedAt ? formatDateTime(submission.submittedAt) : '—'}</td>
                    <td>{formatScore(submission.score)}</td>
                    <td>
                      <Status value={submission.status} />
                    </td>
                    <td>
                      <Link className="btn btn-sm" href={`/submissions/${submission.id}`}>
                        Open
                      </Link>
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

function SubmissionView({ submissionId }: { submissionId: number }) {
  const query = useGetSubmission(submissionId, {
    query: { queryKey: ['submission', submissionId], enabled: Number.isFinite(submissionId) },
  });
  const submission = query.data;
  const [, navigate] = useLocation();
  return (
    <>
      <PageHeading
        kicker="My report"
        title={submission ? `Report #${submission.id}` : 'Report'}
        description={submission ? `${submission.storeName} · ${submission.storeRegion}` : 'Loading report…'}
        action={
          <Link href="/submissions" className="btn">
            <ArrowLeft size={14} /> Back to history
          </Link>
        }
      />
      {query.isLoading ? (
        <div className="panel">
          <StateBlock loading />
        </div>
      ) : query.isError ? (
        <div className="panel">
          <StateBlock error onRetry={() => query.refetch()} title="Report unavailable" description="You can only open your own reports." />
        </div>
      ) : submission ? (
        <>
          <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
            <div className="detail-list">
              <DetailItem label="Status" value={<Status value={submission.status} />} />
              <DetailItem label="Score" value={formatScore(submission.score)} />
              <DetailItem label="Visit date" value={formatDate(submission.visitDate)} />
              <DetailItem label="Submitted" value={formatDateTime(submission.submittedAt)} />
              <DetailItem label="Reviewer" value={submission.reviewerName ?? 'Not reviewed yet'} />
              <DetailItem label="Reviewed" value={formatDateTime(submission.reviewedAt)} />
            </div>
            {submission.reviewerComment && (
              <div className="report-copy-block">
                <label>Reviewer feedback</label>
                <p>{submission.reviewerComment}</p>
              </div>
            )}
            {submission.canEdit && (
              <div className="detail-actions">
                <button className="btn btn-primary" onClick={() => navigate(`/assignments/${submission.taskId}`)}>
                  Continue this report
                </button>
              </div>
            )}
          </section>
          <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
            <h2 className="section-title" style={{ marginBottom: 14 }}>
              Answers
            </h2>
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
          </section>
          <section className="panel" style={{ padding: 20 }}>
            <h2 className="section-title" style={{ marginBottom: 14 }}>
              Evidence
            </h2>
            {submission.evidence.length ? (
              <div className="evidence-grid">
                {submission.evidence.map((item) => (
                  <figure className="evidence-card" key={item.id}>
                    <img src={item.url} alt={item.fileName} loading="lazy" />
                    <figcaption>
                      <strong>{item.fileName}</strong>
                      <span>{Math.max(1, Math.round(item.byteSize / 1024))} KB</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="page-desc">No evidence attached.</p>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

export function ShopperWorkspace({
  view,
  taskId,
  submissionId,
}: {
  view: 'dashboard' | 'assignments' | 'assignment' | 'submissions' | 'submission';
  taskId?: number;
  submissionId?: number;
}) {
  if (view === 'assignments') return <AssignmentsPage />;
  if (view === 'assignment' && taskId) return <AssignmentDetail taskId={taskId} />;
  if (view === 'submissions') return <SubmissionHistory />;
  if (view === 'submission' && submissionId) return <SubmissionView submissionId={submissionId} />;
  return <ShopperDashboard />;
}
