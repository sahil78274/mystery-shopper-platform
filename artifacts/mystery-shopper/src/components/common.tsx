import { type FormEvent, type ReactNode, useState } from 'react';
import { ClipboardList, CircleAlert, X } from 'lucide-react';
import type { UserPreferences } from '@workspace/api-client-react';

export type Preferences = Pick<
  UserPreferences,
  'timezone' | 'dateFormat' | 'timeFormat' | 'emailNotifications' | 'weeklyDigest'
>;

export const DEFAULT_PREFERENCES: Preferences = {
  timezone: 'UTC',
  dateFormat: 'MMM d, yyyy',
  timeFormat: '12h',
  emailNotifications: true,
  weeklyDigest: false,
};

function timezoneOrFallback(value?: string | null): string {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value || 'UTC' });
    return value || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatDate(value?: string | null, preferences: Preferences = DEFAULT_PREFERENCES): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  if (preferences.dateFormat === 'yyyy-MM-dd') {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezoneOrFallback(preferences.timezone) }).format(date);
  }
  if (preferences.dateFormat === 'dd/MM/yyyy') {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: timezoneOrFallback(preferences.timezone),
    }).format(date);
  }
  if (preferences.dateFormat === 'MM/dd/yyyy') {
    return new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: timezoneOrFallback(preferences.timezone),
    }).format(date);
  }
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezoneOrFallback(preferences.timezone),
  }).format(date);
}

export function formatDateTime(value?: string | null, preferences: Preferences = DEFAULT_PREFERENCES): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: preferences.timeFormat === '12h',
    timeZone: timezoneOrFallback(preferences.timezone),
  }).format(date);
}

export function formatScore(value?: number | null): string {
  if (value == null) return 'Not scored';
  return `${Math.round(value * 10) / 10}%`;
}

export function Status({ value }: { value?: string | null }) {
  const status = value || 'unknown';
  return <span className={`status status-${status}`}>{status.replaceAll('_', ' ')}</span>;
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  width,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        style={width ? { maxWidth: width } : undefined}
      >
        <header className="modal-head">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export function StateBlock({
  loading,
  error,
  empty,
  onRetry,
  action,
  title,
  description,
}: {
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  onRetry?: () => void;
  action?: ReactNode;
  title?: string;
  description?: string;
}) {
  if (loading) {
    return (
      <div className="loading-state" aria-label="Loading">
        <div style={{ width: 'min(360px, 80%)', display: 'grid', gap: 12 }}>
          <div className="skeleton" style={{ width: '42%', height: 19 }} />
          <div className="skeleton" style={{ width: '82%' }} />
          <div className="skeleton" style={{ width: '67%' }} />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="error-state">
        <div className="state-icon">
          <CircleAlert size={19} />
        </div>
        <h3>{title ?? 'We couldn’t load this view'}</h3>
        <p>{description ?? 'The service returned an error. Try again in a moment.'}</p>
        {onRetry && (
          <button className="btn" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="empty-state">
        <div className="state-icon">
          <ClipboardList size={19} />
        </div>
        <h3>{title ?? 'Nothing here yet'}</h3>
        <p>{description ?? 'Records will appear here as your team adds them.'}</p>
        {action}
      </div>
    );
  }
  return null;
}

export function Field({
  label,
  name,
  defaultValue,
  required,
  type = 'text',
  placeholder,
  options,
  full,
  min,
  max,
  step,
  disabled,
  minLength,
  autoComplete,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  required?: boolean;
  type?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  full?: boolean;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  minLength?: number;
  autoComplete?: string;
}) {
  return (
    <label className={`form-field${full ? ' full' : ''}`}>
      <span className="form-label">
        {label}
        {required && ' *'}
      </span>
      {options ? (
        <select
          className="select"
          name={name}
          defaultValue={defaultValue || options[0]?.value}
          required={required}
          disabled={disabled}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea
          className="textarea"
          name={name}
          defaultValue={defaultValue || ''}
          placeholder={placeholder}
          required={required}
          minLength={minLength}
          disabled={disabled}
        />
      ) : (
        <input
          className="field"
          name={name}
          type={type}
          defaultValue={defaultValue ?? ''}
          placeholder={placeholder}
          required={required}
          min={min}
          max={max}
          step={step}
          minLength={minLength}
          autoComplete={autoComplete}
          disabled={disabled}
        />
      )}
    </label>
  );
}

export function FormFooter({
  onClose,
  busy,
  label,
  closeLabel = 'Cancel',
  disabled = false,
}: {
  onClose: () => void;
  busy: boolean;
  label: string;
  closeLabel?: string;
  disabled?: boolean;
}) {
  return (
    <footer className="form-footer">
      <button className="btn" type="button" onClick={onClose} disabled={busy}>
        {closeLabel}
      </button>
      <button className="btn btn-primary" type="submit" disabled={busy || disabled}>
        {busy ? 'Saving…' : label}
      </button>
    </footer>
  );
}

export function PageHeading({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{kicker}</div>
        <h1>{title}</h1>
        <p className="page-desc">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function DetailItem({ label, value, mono, full }: { label: string; value: ReactNode; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? 'detail-item detail-item-full' : 'detail-item'}>
      <label>{label}</label>
      <div className={mono ? 'mono' : ''}>{value}</div>
    </div>
  );
}

export function useNotify() {
  const [message, setMessage] = useState('');
  const notify = (next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(''), 2800);
  };
  return { message, notify };
}

export function Toast({ message }: { message: string }) {
  return message ? (
    <div className="toast-message" role="status">
      {message}
    </div>
  ) : null;
}

export function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'error' in data) {
      const value = (data as { error?: unknown }).error;
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function submitHandler(callback: (form: HTMLFormElement) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    callback(event.currentTarget);
  };
}
