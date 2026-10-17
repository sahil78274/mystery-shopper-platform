import { useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { submitContactForm } from '@workspace/api-client-react';
import { messageOf } from '@/components/common';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileQuestion,
  Menu,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RicozBrand } from '@/components/brand';
import './landing.css';

const navigation = [
  { label: 'Home', href: '#home' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Benefits', href: '#benefits' },
  { label: 'Contact', href: '#contact' },
];

const steps: {
  number: string;
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    number: '01',
    title: 'Assign Tasks',
    description:
      'Administrators organize store visits and assign tasks to mystery shoppers.',
    icon: ClipboardList,
  },
  {
    number: '02',
    title: 'Complete Store Visits',
    description:
      'Mystery shoppers complete questionnaires, record observations and upload supporting evidence.',
    icon: Building2,
  },
  {
    number: '03',
    title: 'Review Reports',
    description:
      'Quality reviewers verify submissions, approve reports or request corrections.',
    icon: ClipboardCheck,
  },
  {
    number: '04',
    title: 'Track Performance',
    description:
      'Regional teams monitor approved reports and analyse available performance data.',
    icon: BarChart3,
  },
];

const features: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: 'Task Management',
    description:
      'Create store visits, set dates and instructions, and coordinate shopper assignments.',
    icon: ClipboardList,
  },
  {
    title: 'Digital Questionnaires',
    description:
      'Capture consistent visit feedback with structured questions and scoring.',
    icon: FileQuestion,
  },
  {
    title: 'Photo Evidence',
    description:
      'Attach supporting visit photos to submissions for a clearer review record.',
    icon: Camera,
  },
  {
    title: 'Report Review and Approval',
    description:
      'Review answers and evidence, record decisions and return reports for correction.',
    icon: ClipboardCheck,
  },
  {
    title: 'Regional Analytics',
    description:
      'View regional scorecards, comparisons and trends based on approved reports.',
    icon: Activity,
  },
  {
    title: 'Performance Tracking',
    description:
      'Follow visit progress and approved outcomes across the reporting workflow.',
    icon: TrendingUp,
  },
];

const benefits: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: 'Centralized Operations',
    description:
      'Coordinate store coverage, field assignments and reporting in one workspace.',
    icon: Building2,
  },
  {
    title: 'Structured Feedback',
    description:
      'Give each visit a consistent format for observations, answers and evidence.',
    icon: FileQuestion,
  },
  {
    title: 'Quality Control',
    description:
      'Add a clear review step before reports contribute to performance views.',
    icon: ShieldCheck,
  },
  {
    title: 'Data-Informed Decisions',
    description:
      'Use available approved-report data to understand patterns across locations.',
    icon: TrendingUp,
  },
];

const sampleVisits = [
  {
    store: 'Central Market',
    region: 'North region',
    shopper: 'A. Sharma',
    status: 'In review',
    statusTone: 'review',
  },
  {
    store: 'Riverside Point',
    region: 'West region',
    shopper: 'M. Kapoor',
    status: 'Assigned',
    statusTone: 'assigned',
  },
  {
    store: 'City Square',
    region: 'North region',
    shopper: 'R. Mehta',
    status: 'Approved',
    statusTone: 'approved',
  },
];

function ProductPreview() {
  return (
    <div
      className="landing-preview-wrap"
      role="img"
      aria-label="Illustrative Ricoz workspace mockup with sample visit data, not live statistics."
    >
      <div className="landing-preview-glow" aria-hidden="true" />
      <div className="landing-preview">
        <div className="preview-window-bar">
          <div className="preview-window-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span className="preview-window-title">Ricoz workspace</span>
          <span className="preview-demo-tag">ILLUSTRATIVE DATA</span>
        </div>
        <div className="preview-workspace">
          <aside className="preview-sidebar" aria-hidden="true">
            <div className="preview-sidebar-mark">
              <span>R</span>
            </div>
            <span className="preview-sidebar-line active" />
            <span className="preview-sidebar-line" />
            <span className="preview-sidebar-line" />
            <span className="preview-sidebar-line short" />
            <span className="preview-sidebar-spacer" />
            <span className="preview-sidebar-avatar">RC</span>
          </aside>
          <div className="preview-content">
            <div className="preview-content-top">
              <div>
                <span className="preview-eyebrow">OPERATIONS OVERVIEW</span>
                <h2>Workspace snapshot</h2>
              </div>
              <div className="preview-date">
                <span /> Sample view
              </div>
            </div>
            <div className="preview-metrics">
              <div className="preview-metric">
                <span>Open assignments</span>
                <strong>12</strong>
                <span className="preview-metric-icon">
                  <ClipboardList size={14} />
                </span>
              </div>
              <div className="preview-metric">
                <span>Pending reviews</span>
                <strong>04</strong>
                <span className="preview-metric-icon">
                  <ClipboardCheck size={14} />
                </span>
              </div>
              <div className="preview-metric">
                <span>Approved reports</span>
                <strong>08</strong>
                <span className="preview-metric-icon">
                  <CheckCircle2 size={14} />
                </span>
              </div>
            </div>
            <div className="preview-activity-card">
              <div className="preview-card-heading">
                <div>
                  <strong>Recent visit activity</strong>
                  <span>Example tasks and statuses</span>
                </div>
                <span className="preview-more" aria-hidden="true">
                  •••
                </span>
              </div>
              <div className="preview-table-head">
                <span>LOCATION</span>
                <span>SHOPPER</span>
                <span>STATUS</span>
              </div>
              {sampleVisits.map((visit) => (
                <div className="preview-table-row" key={visit.store}>
                  <div className="preview-store">
                    <span className="preview-store-icon">
                      <Building2 size={12} />
                    </span>
                    <span>
                      <strong>{visit.store}</strong>
                      <small>{visit.region}</small>
                    </span>
                  </div>
                  <span className="preview-shopper">{visit.shopper}</span>
                  <span className={`preview-status ${visit.statusTone}`}>
                    {visit.status}
                  </span>
                </div>
              ))}
              <div className="preview-footnote">
                Sample data only — not live platform statistics.
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-note">
        <CheckCircle2 size={15} /> A clearer view of every visit
      </div>
    </div>
  );
}

function LandingNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="landing-header">
      <div className="landing-header-inner">
        <a
          className="landing-brand-link"
          href="#home"
          aria-label="Ricoz home"
          onClick={closeMenu}
        >
          <RicozBrand
            className="landing-brand"
            subtitle="Mystery shopping platform"
          />
        </a>
        <nav
          className={`landing-nav${menuOpen ? ' is-open' : ''}`}
          id="landing-navigation"
          aria-label="Main navigation"
        >
          <div className="landing-nav-links">
            {navigation.map((item) => (
              <a key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
          </div>
          <div className="landing-nav-actions">
            <Link
              className="landing-button landing-button-outline"
              href="/login"
              onClick={closeMenu}
            >
              Sign In
            </Link>
            <Link
              className="landing-button landing-button-primary"
              href="/register"
              onClick={closeMenu}
            >
              Get Started <ArrowRight size={15} />
            </Link>
          </div>
        </nav>
        <button
          className="landing-menu-toggle"
          type="button"
          aria-label={
            menuOpen ? 'Close navigation menu' : 'Open navigation menu'
          }
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
    </header>
  );
}

export default function LandingPage() {
  const [contactBusy, setContactBusy] = useState(false);
  const [contactError, setContactError] = useState('');
  const [contactSent, setContactSent] = useState(false);

  const submitContact = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContactError('');
    setContactSent(false);
    setContactBusy(true);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await submitContactForm({
        name: String(values.get('name') ?? '').trim(),
        email: String(values.get('email') ?? '').trim(),
        subject: String(values.get('subject') ?? '').trim(),
        message: String(values.get('message') ?? '').trim(),
      });
      form.reset();
      setContactSent(true);
    } catch (reason) {
      setContactError(messageOf(reason));
    } finally {
      setContactBusy(false);
    }
  };

  return (
    <div className="landing-page">
      <LandingNavigation />
      <main>
        <section className="landing-hero" id="home">
          <div className="landing-container hero-grid">
            <div className="hero-copy">
              <div className="hero-badge">
                <span /> Smarter mystery shopping management
              </div>
              <h1>
                Turn Customer Experiences Into <span>Actionable Insights.</span>
              </h1>
              <p className="hero-description">
                Manage mystery shopping operations from one platform. Assign
                store visits, collect structured feedback, review evidence and
                monitor performance through a streamlined workflow.
              </p>
              <div className="hero-actions">
                <Link
                  className="landing-button landing-button-primary landing-button-large"
                  href="/register"
                >
                  Get Started <ArrowRight size={17} />
                </Link>
                <Link
                  className="landing-button landing-button-outline landing-button-large"
                  href="/login"
                >
                  Sign In <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="hero-assurance">
                <span>
                  <CheckCircle2 size={15} /> Role-based workspace
                </span>
                <span>
                  <CheckCircle2 size={15} /> Clear review workflow
                </span>
              </div>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section
          className="landing-about section-space"
          aria-labelledby="about-title"
        >
          <div className="landing-container about-grid">
            <div className="section-intro">
              <span className="section-kicker">One connected workspace</span>
              <h2 id="about-title">
                Everything You Need to Manage Mystery Shopping.
              </h2>
            </div>
            <div className="about-copy">
              <p className="section-lead">
                Ricoz brings mystery shoppers, administrators, quality reviewers
                and regional brand executives together in one organized
                workspace.
              </p>
              <p>
                From planning a visit to reviewing its report, each team member
                has a clear role in the same operational flow. Assignments,
                questionnaires, evidence and approved results stay connected—so
                teams can focus on what happened in the customer experience and
                what to do next.
              </p>
              <div className="role-list" aria-label="Workspace roles">
                <span>
                  <Building2 size={15} /> Administrators
                </span>
                <span>
                  <UsersRound size={15} /> Mystery shoppers
                </span>
                <span>
                  <ShieldCheck size={15} /> Quality reviewers
                </span>
                <span>
                  <Activity size={15} /> Regional brand executives
                </span>
              </div>
            </div>
          </div>
        </section>

        <section
          className="landing-how section-space"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="landing-container">
            <div className="section-heading centered">
              <span className="section-kicker">
                A clear path from visit to insight
              </span>
              <h2 id="how-title">How It Works</h2>
              <p>
                Each step has a clear owner, keeping fieldwork organized from
                assignment through review.
              </p>
            </div>
            <div className="steps-grid">
              {steps.map(({ number, title, description, icon: Icon }) => (
                <article className="step-card" key={number}>
                  <div className="step-card-top">
                    <span className="step-number">{number}</span>
                    <span className="landing-icon">
                      <Icon size={20} strokeWidth={1.8} />
                    </span>
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-features section-space"
          id="features"
          aria-labelledby="features-title"
        >
          <div className="landing-container">
            <div className="section-heading">
              <span className="section-kicker">
                Built for the whole workflow
              </span>
              <h2 id="features-title">The Tools to Keep Every Visit Moving.</h2>
              <p>
                Purpose-built workspace features support planning, field
                reporting, review and regional visibility.
              </p>
            </div>
            <div className="features-grid">
              {features.map(({ title, description, icon: Icon }) => (
                <article className="feature-card" key={title}>
                  <span className="landing-icon">
                    <Icon size={20} strokeWidth={1.8} />
                  </span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-benefits section-space"
          id="benefits"
          aria-labelledby="benefits-title"
        >
          <div className="landing-container">
            <div className="benefits-heading">
              <div>
                <span className="section-kicker">
                  Designed for consistent execution
                </span>
                <h2 id="benefits-title">
                  Better Visibility. More Consistent Experiences.
                </h2>
              </div>
              <p>
                Connect teams around dependable visit records and clear review
                outcomes.
              </p>
            </div>
            <div className="benefits-grid">
              {benefits.map(({ title, description, icon: Icon }) => (
                <article className="benefit-item" key={title}>
                  <span className="benefit-icon">
                    <Icon size={19} strokeWidth={1.8} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section
          className="landing-cta section-space"
          id="contact"
          aria-labelledby="cta-title"
        >
          <div className="landing-container">
            <div className="cta-panel">
              <div className="cta-mark" aria-hidden="true">
                <span>R</span>
              </div>
              <div className="cta-copy">
                <span className="section-kicker">
                  Your workspace is ready when you are
                </span>
                <h2 id="cta-title">Ready to Get Started?</h2>
                <p>
                  Access your workspace to manage assignments, submit reports
                  and review performance.
                </p>
                <span className="cta-help">
                  Need an internal team account? Contact your Ricoz
                  administrator.
                </span>
              </div>
              <div className="cta-actions">
                <Link
                  className="landing-button landing-button-outline"
                  href="/login"
                >
                  Sign In <ArrowUpRight size={16} />
                </Link>
                <Link
                  className="landing-button landing-button-primary"
                  href="/register"
                >
                  Get Started <ArrowRight size={16} />
                </Link>
              </div>
            </div>
            <div className="contact-form-panel">
              <div className="contact-form-heading">
                <h3>Talk to the Ricoz team</h3>
                <p>Send us a question and we’ll get back to you by email.</p>
              </div>
              <form className="contact-form" onSubmit={submitContact}>
                <label className="contact-field">
                  <span>Name *</span>
                  <input name="name" required minLength={2} maxLength={120} autoComplete="name" />
                </label>
                <label className="contact-field">
                  <span>Email address *</span>
                  <input name="email" type="email" required maxLength={254} autoComplete="email" />
                </label>
                <label className="contact-field contact-field-wide">
                  <span>Subject *</span>
                  <input name="subject" required minLength={3} maxLength={160} />
                </label>
                <label className="contact-field contact-field-wide">
                  <span>Message *</span>
                  <textarea name="message" required minLength={10} maxLength={4000} rows={5} />
                </label>
                {contactError && <p className="contact-feedback is-error" role="alert">{contactError}</p>}
                {contactSent && <p className="contact-feedback is-success" role="status">Your enquiry was sent. Thank you for reaching out.</p>}
                <div className="contact-submit-row">
                  <span>We’ll reply to the email address you provide.</span>
                  <button className="landing-button landing-button-primary" type="submit" disabled={contactBusy}>
                    {contactBusy ? 'Sending…' : 'Send enquiry'} <ArrowRight size={15} />
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-main">
            <div className="footer-brand-block">
              <a
                className="footer-brand-link"
                href="#home"
                aria-label="Ricoz home"
              >
                <RicozBrand
                  className="landing-footer-brand"
                  subtitle="Mystery shopping platform"
                />
              </a>
              <p>
                One connected workspace for planning visits, collecting feedback
                and reviewing customer experiences.
              </p>
            </div>
            <div className="footer-links-block">
              <h2>Quick links</h2>
              <a href="#how-it-works">How It Works</a>
              <a href="#features">Features</a>
              <a href="#benefits">Benefits</a>
              <a href="#contact">Contact</a>
            </div>
            <div className="footer-links-block">
              <h2>Workspace</h2>
              <Link href="/login">Sign In</Link>
              <Link href="/register">Get Started</Link>
              <span className="footer-access-note">
                Internal roles are provisioned by a Ricoz administrator.
              </span>
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} Ricoz. All rights reserved.
            </span>
            <a href="#home">
              Back to top <ArrowUpRight size={13} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
