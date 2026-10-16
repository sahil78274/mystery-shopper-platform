import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import {
  Activity,
  BarChart3,
  Camera,
  ClipboardList,
  ClipboardCheck,
  LayoutGrid,
  Layers,
  MapPin,
  Menu,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react';
import { ROLE_LABELS, homeForRole, useAuth } from '@/lib/auth';

/** In-page sections used by the navigation, footer and smooth scrolling. */
const SECTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'features', label: 'Features' },
  { id: 'benefits', label: 'Benefits' },
  { id: 'contact', label: 'Contact' },
];

const STEPS = [
  {
    icon: ClipboardList,
    title: 'Assign Tasks',
    body: 'Administrators organize store visits and assign tasks to mystery shoppers.',
  },
  {
    icon: Store,
    title: 'Complete Store Visits',
    body: 'Mystery shoppers follow questionnaires, record observations and upload supporting evidence.',
  },
  {
    icon: ShieldCheck,
    title: 'Review Reports',
    body: 'Quality reviewers evaluate submissions, verify evidence and request corrections when needed.',
  },
  {
    icon: TrendingUp,
    title: 'Track Performance',
    body: 'Regional teams monitor approved reports, compare performance and use insights to identify improvement opportunities.',
  },
];

const FEATURES = [
  {
    icon: ClipboardList,
    title: 'Task Management',
    body: 'Organize store visits, assignments and task progress.',
  },
  {
    icon: ClipboardCheck,
    title: 'Digital Questionnaires',
    body: 'Collect structured responses using supported question types.',
  },
  {
    icon: Camera,
    title: 'Photo Evidence',
    body: 'Attach supporting photographs to reports where required.',
  },
  {
    icon: ShieldCheck,
    title: 'Report Review',
    body: 'Review submissions, approve reports or request corrections.',
  },
  {
    icon: MapPin,
    title: 'Regional Analytics',
    body: 'Monitor regional performance and compare available results.',
  },
  {
    icon: Activity,
    title: 'Performance Tracking',
    body: 'Track workflow progress and review approved reports.',
  },
];

const BENEFITS = [
  {
    icon: LayoutGrid,
    title: 'Centralized Operations',
    body: 'Manage mystery shopping activities from one workspace.',
  },
  {
    icon: ClipboardCheck,
    title: 'Structured Feedback',
    body: 'Collect consistent observations through digital questionnaires.',
  },
  {
    icon: ShieldCheck,
    title: 'Quality Control',
    body: 'Review reports and supporting evidence before approval.',
  },
  {
    icon: BarChart3,
    title: 'Data-Informed Decisions',
    body: 'Use available reporting and analytics to identify performance trends.',
  },
];

const ROLES = [
  {
    icon: ShieldCheck,
    role: ROLE_LABELS.admin,
    body: 'Plan store visits, manage the team and issue accounts for reviewers and regional executives.',
  },
  {
    icon: UserCheck,
    role: ROLE_LABELS.mystery_shopper,
    body: 'Open an assignment, answer the questionnaire, attach evidence and submit the visit report.',
  },
  {
    icon: ClipboardCheck,
    role: ROLE_LABELS.reviewer,
    body: 'Work the review queue, inspect evidence and record an approval or a correction request.',
  },
  {
    icon: MapPin,
    role: ROLE_LABELS.regional_executive,
    body: 'Follow approved results for your region through scorecards, comparisons and trends.',
  },
];

/** Sample store-performance figures used only inside the illustrative mockup. */
const PREVIEW_PERFORMANCE = [
  { label: 'Andheri West', value: 92 },
  { label: 'Koramangala', value: 78 },
  { label: 'Sector 18', value: 64 },
];

const PREVIEW_REPORTS = [
  { name: 'Central Plaza', status: 'Approved', tone: 'good' },
  { name: 'City Walk', status: 'In review', tone: 'pending' },
  { name: 'Market Street', status: 'Needs correction', tone: 'attention' },
];

function BrandMark({ light = false }: { light?: boolean }) {
  return (
    <span className={`land-brand${light ? ' land-brand-light' : ''}`}>
      <span className="land-brand-mark" aria-hidden="true">
        R
      </span>
      <span className="land-brand-text">Ricoz</span>
    </span>
  );
}

function CtaButtons({ size = 'md' }: { size?: 'md' | 'lg' }) {
  const { user } = useAuth();
  const className = size === 'lg' ? 'land-btn land-btn-lg' : 'land-btn';
  if (user) {
    return (
      <div className="land-cta-row">
        <Link className={`${className} land-btn-primary`} href={homeForRole(user.role)}>
          Go to workspace
        </Link>
      </div>
    );
  }
  return (
    <div className="land-cta-row">
      <Link className={`${className} land-btn-primary`} href="/register">
        Get Started
      </Link>
      <Link className={`${className} land-btn-outline`} href="/login">
        Sign In
      </Link>
    </div>
  );
}

/**
 * Static illustration of the workspace. It mirrors the real screens (summary
 * cards, review queue, store performance, recent reports) but every figure is
 * a placeholder — it is labelled as illustrative and never fetched as data.
 */
function ProductPreview() {
  return (
    <figure className="land-preview">
      <div className="land-preview-window">
        <div className="land-preview-bar">
          <span className="land-preview-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="land-preview-title">Fieldnote workspace</span>
        </div>
        <div className="land-preview-body">
          <aside className="land-preview-side" aria-hidden="true">
            <span className="land-preview-side-brand">Fieldnote</span>
            <span className="land-preview-nav is-active">Dashboard</span>
            <span className="land-preview-nav">Tasks</span>
            <span className="land-preview-nav">Review queue</span>
            <span className="land-preview-nav">Scorecards</span>
            <span className="land-preview-nav">Reports</span>
          </aside>
          <div className="land-preview-main">
            <div className="land-preview-heading">
              <span>Operations overview</span>
              <span className="land-preview-chip">Sample workspace</span>
            </div>
            <div className="land-preview-cards">
              <div className="land-preview-card">
                <span>Assigned visits</span>
                <strong>12</strong>
              </div>
              <div className="land-preview-card">
                <span>Pending reviews</span>
                <strong>4</strong>
              </div>
              <div className="land-preview-card">
                <span>Completed visits</span>
                <strong>38</strong>
              </div>
              <div className="land-preview-card">
                <span>Stores covered</span>
                <strong>9</strong>
              </div>
            </div>
            <div className="land-preview-grid">
              <section className="land-preview-panel">
                <h3>Store performance</h3>
                {PREVIEW_PERFORMANCE.map((row) => (
                  <div className="land-preview-bar-row" key={row.label}>
                    <span>{row.label}</span>
                    <span className="land-preview-track" aria-hidden="true">
                      <span className="land-preview-fill" style={{ width: `${row.value}%` }} />
                    </span>
                    <span className="land-preview-value">{row.value}%</span>
                  </div>
                ))}
              </section>
              <section className="land-preview-panel">
                <h3>Recent reports</h3>
                <ul className="land-preview-list">
                  {PREVIEW_REPORTS.map((row) => (
                    <li key={row.name}>
                      <span>{row.name}</span>
                      <span className={`land-preview-pill is-${row.tone}`}>{row.status}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="land-preview-note">
        Illustrative preview of the workspace layout — sample figures, not company data.
      </figcaption>
    </figure>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu as soon as the viewport is wide enough for the
  // desktop navigation, so it can never get stranded open.
  useEffect(() => {
    if (!menuOpen) return;
    const onResize = () => {
      if (window.innerWidth > 900) setMenuOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [menuOpen]);

  return (
    <div className="land">
      <a className="land-skip" href="#main">
        Skip to content
      </a>

      <header className={`land-nav${menuOpen ? ' is-open' : ''}`}>
        <div className="land-nav-inner">
          <Link href="/" className="land-nav-brand" aria-label="Ricoz home">
            <BrandMark />
          </Link>

          <nav className="land-nav-links" aria-label="Landing page sections">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="land-nav-link"
                onClick={() => setMenuOpen(false)}
              >
                {section.label}
              </a>
            ))}
          </nav>

          <div className="land-nav-actions">
            {user ? (
              <Link className="land-btn land-btn-outline" href={homeForRole(user.role)}>
                Go to workspace
              </Link>
            ) : (
              <>
                <Link className="land-btn land-btn-outline" href="/login">
                  Sign In
                </Link>
                <Link className="land-btn land-btn-primary" href="/register">
                  Get Started
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="land-nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="land-mobile-menu"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <Link className="land-btn land-btn-primary land-nav-mobile-cta" href={user ? homeForRole(user.role) : '/register'}>
            {user ? 'Workspace' : 'Get Started'}
          </Link>
        </div>

        <div id="land-mobile-menu" className="land-mobile-menu" hidden={!menuOpen}>
          <nav aria-label="Landing page sections">
            {SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="land-mobile-link"
                onClick={() => setMenuOpen(false)}
              >
                {section.label}
              </a>
            ))}
          </nav>
          <div className="land-mobile-actions">
            {user ? (
              <Link className="land-btn land-btn-primary" href={homeForRole(user.role)} onClick={() => setMenuOpen(false)}>
                Go to workspace
              </Link>
            ) : (
              <>
                <Link className="land-btn land-btn-primary" href="/register" onClick={() => setMenuOpen(false)}>
                  Get Started
                </Link>
                <Link className="land-btn land-btn-outline" href="/login" onClick={() => setMenuOpen(false)}>
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main">
        <section className="land-hero" id="home">
          <div className="land-shell land-hero-grid">
            <div className="land-hero-copy">
              <p className="land-badge">
                <Sparkles size={14} aria-hidden="true" />
                Smarter mystery shopping management
              </p>
              <h1 className="land-hero-title">
                Turn Customer Experiences Into <span className="land-accent">Actionable Insights</span>.
              </h1>
              <p className="land-hero-text">
                Manage mystery shopping operations from one platform. Assign store visits, collect structured
                feedback, review evidence and monitor performance with a streamlined workflow.
              </p>
              <CtaButtons size="lg" />
            </div>
            <div className="land-hero-visual">
              <ProductPreview />
            </div>
          </div>
        </section>

        <section className="land-section" id="about" aria-labelledby="about-title">
          <div className="land-shell">
            <div className="land-section-head">
              <p className="land-eyebrow">One platform</p>
              <h2 className="land-section-title" id="about-title">
                Everything You Need to Manage Mystery Shopping.
              </h2>
              <p className="land-section-text">
                Ricoz brings mystery shoppers, administrators, quality reviewers and regional teams together in
                one organized workspace.
              </p>
            </div>
            <div className="land-role-grid">
              {ROLES.map(({ icon: Icon, role, body }) => (
                <article className="land-role-card" key={role}>
                  <span className="land-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <h3>{role}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="land-section land-section-alt" id="how-it-works" aria-labelledby="how-title">
          <div className="land-shell">
            <div className="land-section-head">
              <p className="land-eyebrow">How it works</p>
              <h2 className="land-section-title" id="how-title">
                A Clear Workflow From Assignment To Insight.
              </h2>
              <p className="land-section-text">
                Every visit follows the same route: it is assigned, completed in the field, checked by quality
                review and reflected in regional reporting once approved.
              </p>
            </div>
            <ol className="land-step-grid">
              {STEPS.map(({ icon: Icon, title, body }, index) => (
                <li className="land-step-card" key={title}>
                  <span className="land-step-num" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="land-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="land-section" id="features" aria-labelledby="features-title">
          <div className="land-shell">
            <div className="land-section-head">
              <p className="land-eyebrow">Features</p>
              <h2 className="land-section-title" id="features-title">
                Built for Every Stage of the Workflow.
              </h2>
              <p className="land-section-text">
                From planning a visit to reading the approved result, each step has the tools it needs.
              </p>
            </div>
            <div className="land-card-grid">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <article className="land-card" key={title}>
                  <span className="land-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="land-section land-section-alt" id="benefits" aria-labelledby="benefits-title">
          <div className="land-shell">
            <div className="land-section-head">
              <p className="land-eyebrow">Benefits</p>
              <h2 className="land-section-title" id="benefits-title">
                Better Visibility. More Consistent Experiences.
              </h2>
            </div>
            <div className="land-benefit-grid">
              {BENEFITS.map(({ icon: Icon, title, body }) => (
                <article className="land-benefit" key={title}>
                  <span className="land-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="land-cta" id="contact" aria-labelledby="cta-title">
          <div className="land-shell land-cta-inner">
            <div>
              <p className="land-eyebrow land-eyebrow-light">Get in touch</p>
              <h2 className="land-cta-title" id="cta-title">
                Ready to Get Started?
              </h2>
              <p className="land-cta-text">
                Access your workspace to manage assignments, submit reports and review performance.
              </p>
            </div>
            <div className="land-cta-actions">
              <Link className="land-btn land-btn-lg land-btn-outline-light" href="/login">
                Sign In
              </Link>
              <Link className="land-btn land-btn-lg land-btn-light" href="/register">
                Get Started
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="land-footer">
        <div className="land-shell land-footer-grid">
          <div className="land-footer-brand">
            <BrandMark light />
            <p>
              A mystery shopping management platform for planning store visits, collecting structured field
              feedback and reviewing performance in one organized workspace.
            </p>
          </div>

          <nav className="land-footer-col" aria-label="Quick links">
            <h2>Quick Links</h2>
            <a href="#how-it-works">How It Works</a>
            <a href="#features">Features</a>
            <a href="#benefits">Benefits</a>
          </nav>

          <nav className="land-footer-col" aria-label="Account links">
            <h2>Get Started</h2>
            <Link href="/login">Sign In</Link>
            <Link href="/register">Register</Link>
          </nav>

          <div className="land-footer-col">
            <h2>Contact</h2>
            <p>
              Support and operations contact details are shared inside the workspace, alongside your
              organization settings.
            </p>
            <a className="land-footer-link" href="#contact">
              Back to contact section
            </a>
          </div>
        </div>
        <div className="land-shell land-footer-bottom">
          <p>© {new Date().getFullYear()} Ricoz. All rights reserved.</p>
          <p className="land-footer-note">
            Mystery shoppers can register for an account. Administrator, reviewer and regional accounts are
            issued by your organization.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
