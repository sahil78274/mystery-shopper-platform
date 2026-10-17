import { useState, type FormEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { CircleAlert, LogIn, ShieldCheck, UserPlus } from 'lucide-react';
import { RicozBrand } from '@/components/brand';
import { useAuth } from '@/lib/auth';
import { messageOf } from '@/components/common';

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <aside className="auth-aside">
          <RicozBrand className="auth-brand" subtitle="Mystery shopping platform" />
          <h2>Mystery shopping, end to end.</h2>
          <p>
            Plan visits, collect field evidence, review submissions and track store performance from a single
            workspace — with every action recorded against your account.
          </p>
          <ul className="auth-points">
            <li>
              <ShieldCheck size={15} /> Role-based access for administrators, shoppers, reviewers and regional
              executives.
            </li>
            <li>
              <ShieldCheck size={15} /> Only approved reports feed official store scorecards.
            </li>
          </ul>
        </aside>
        <section className="auth-main">
          <h1>{title}</h1>
          <p className="page-desc">{subtitle}</p>
          {children}
          <div className="auth-footer">{footer}</div>
        </section>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const next = new URLSearchParams(search).get('next');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      await login({
        email: String(values.get('email') ?? '').trim(),
        password: String(values.get('password') ?? ''),
      });
      navigate(next && next.startsWith('/') ? next : '/');
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the account your administrator created for you."
      footer={
        <>
          Mystery shopper? <Link href="/register">Create your shopper account</Link>
        </>
      }
    >
      <form onSubmit={submit} className="auth-form">
        <label className="form-field">
          <span className="form-label">Email address *</span>
          <input className="field" name="email" type="email" autoComplete="email" required autoFocus />
        </label>
        <label className="form-field">
          <span className="form-label">Password *</span>
          <input
            className="field"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            <CircleAlert size={13} /> {error}
          </p>
        )}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          <LogIn size={15} />
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const [, navigate] = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const values = new FormData(event.currentTarget);
    const password = String(values.get('password') ?? '');
    const confirm = String(values.get('confirmPassword') ?? '');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await register({
        fullName: String(values.get('fullName') ?? '').trim(),
        email: String(values.get('email') ?? '').trim(),
        password,
        phone: String(values.get('phone') ?? '').trim(),
        city: String(values.get('city') ?? '').trim(),
        experience: Number(values.get('experience') ?? 0),
      });
      navigate('/');
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Create shopper account"
      subtitle="Public registration is only available for mystery shoppers. Reviewer and executive accounts are issued by an administrator."
      footer={
        <>
          Already registered? <Link href="/login">Sign in instead</Link>
        </>
      }
    >
      <form onSubmit={submit} className="auth-form">
        <label className="form-field">
          <span className="form-label">Full name *</span>
          <input className="field" name="fullName" required autoComplete="name" autoFocus />
        </label>
        <label className="form-field">
          <span className="form-label">Email address *</span>
          <input className="field" name="email" type="email" required autoComplete="email" />
        </label>
        <label className="form-field">
          <span className="form-label">Phone *</span>
          <input className="field" name="phone" required autoComplete="tel" />
        </label>
        <label className="form-field">
          <span className="form-label">City *</span>
          <input className="field" name="city" required autoComplete="address-level2" />
        </label>
        <label className="form-field">
          <span className="form-label">Years of experience</span>
          <input className="field" name="experience" type="number" min={0} defaultValue={0} />
        </label>
        <label className="form-field">
          <span className="form-label">Password *</span>
          <input
            className="field"
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
          />
          <span className="form-hint">At least 8 characters.</span>
        </label>
        <label className="form-field">
          <span className="form-label">Confirm password *</span>
          <input
            className="field"
            name="confirmPassword"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            <CircleAlert size={13} /> {error}
          </p>
        )}
        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          <UserPlus size={15} />
          {busy ? 'Creating account…' : 'Create account'}
        </button>
        <p className="auth-note">
          Your profile is created with <strong>pending</strong> verification. An administrator must approve it
          before visits can be assigned to you.
        </p>
      </form>
    </AuthShell>
  );
}
