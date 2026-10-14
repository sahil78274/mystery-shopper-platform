import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileQuestion,
  Filter,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Store as StoreIcon,
  UsersRound,
  X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey,
  getGetQuestionnaireQueryKey,
  getGetQuestionnairesQueryKey,
  getGetShopperQueryKey,
  getGetShoppersQueryKey,
  getGetStoreQueryKey,
  getGetStoresQueryKey,
  getGetTaskQueryKey,
  getGetTasksQueryKey,
  useCreateQuestionnaire,
  useCreateShopper,
  useCreateStore,
  useCreateTask,
  useDecideShopperVerification,
  useDeleteStore,
  useGetDashboard,
  useGetQuestionnaire,
  useGetQuestionnaires,
  useGetShopper,
  useGetShoppers,
  useGetStore,
  useGetStores,
  useGetTask,
  useGetTasks,
  useHealthCheck,
  useUpdateQuestionnaire,
  useUpdateShopper,
  useUpdateStore,
  useUpdateTask,
} from '@workspace/api-client-react';
import type {
  Questionnaire,
  QuestionnaireInput,
  Shopper,
  ShopperInput,
  Store,
  StoreInput,
  Task,
  TaskInput,
} from '@workspace/api-client-react';

type Entity = 'stores' | 'shoppers' | 'tasks' | 'questionnaires';
const navItems = [
  { label: 'Dashboard', href: '/', icon: LayoutDashboard },
  { label: 'Stores', href: '/stores', icon: Building2 },
  { label: 'Mystery Shoppers', href: '/shoppers', icon: UsersRound },
  { label: 'Verification', href: '/verification', icon: ShieldCheck },
  { label: 'Tasks', href: '/tasks', icon: ClipboardList },
  { label: 'Questionnaires', href: '/questionnaires', icon: FileQuestion },
  { label: 'Reports', href: '/reports', icon: Activity },
  { label: 'Settings', href: '/settings', icon: SlidersHorizontal },
];

function labelForPath(path: string) {
  if (path.startsWith('/stores')) return 'Stores';
  if (path.startsWith('/shoppers')) return 'Mystery Shoppers';
  if (path.startsWith('/verification')) return 'Verification';
  if (path.startsWith('/tasks')) return 'Tasks';
  if (path.startsWith('/questionnaires')) return 'Questionnaires';
  if (path.startsWith('/reports')) return 'Reports';
  if (path.startsWith('/settings')) return 'Settings';
  return 'Dashboard';
}

function Status({ value }: { value?: string | null }) {
  const status = value || 'unknown';
  return <span className={`status status-${status}`}>{status.replaceAll('_', ' ')}</span>;
}

function Modal({
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

function StateBlock({
  loading,
  error,
  empty,
  onRetry,
  action,
}: {
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  onRetry?: () => void;
  action?: ReactNode;
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
        <div className="state-icon"><CircleAlert size={19} /></div>
        <h3>We couldn’t load this view</h3>
        <p>The service returned an error. Try again in a moment.</p>
        {onRetry && <button className="btn" onClick={onRetry}>Retry</button>}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="empty-state">
        <div className="state-icon"><ClipboardList size={19} /></div>
        <h3>Nothing here yet</h3>
        <p>Records will appear here as your team adds them.</p>
        {action}
      </div>
    );
  }
  return null;
}

function Field({
  label,
  name,
  defaultValue,
  required,
  type = 'text',
  placeholder,
  options,
  full,
  min,
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
}) {
  return (
    <label className={`form-field${full ? ' full' : ''}`}>
      <span className="form-label">{label}{required && ' *'}</span>
      {options ? (
        <select className="select" name={name} defaultValue={defaultValue || options[0]?.value} required={required}>
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea className="textarea" name={name} defaultValue={defaultValue || ''} placeholder={placeholder} required={required} />
      ) : (
        <input
          className="field"
          name={name}
          type={type}
          defaultValue={defaultValue ?? ''}
          placeholder={placeholder}
          required={required}
          min={min}
        />
      )}
    </label>
  );
}

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const health = useHealthCheck();
  const title = labelForPath(path);
  return (
    <div className="app-shell">
      <div className={`mobile-overlay${mobileOpen ? ' open' : ''}`} onClick={() => setMobileOpen(false)} />
      <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><StoreIcon size={19} /></div>
          <div>
            <div className="brand-name">Fieldnote</div>
            <div className="brand-sub">Quality operations</div>
          </div>
        </div>
        <div className="nav-label">Workspace</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ label, href, icon: Icon }) => {
            const active = href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`nav-item${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span className="nav-text">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="side-bottom">
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, color: health.isError ? '#d9a09a' : '#a8c8b8' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            {health.isLoading ? 'Checking service' : health.isError ? 'Service unavailable' : 'Service operational'}
          </div>
          Field operations<br />A clear view of every visit.
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
              <Menu size={17} />
            </button>
            <button className="icon-button desktop-menu" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed(!collapsed)}>
              <SlidersHorizontal size={16} />
            </button>
            <div className="crumb">Workspace <span style={{ margin: '0 7px', color: '#c1c6c3' }}>/</span><strong>{title}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="profile">
              <div className="profile-avatar">FO</div>
              <div><div className="profile-name">Field Operations</div><div className="profile-role">Administrator</div></div>
              <ChevronDown size={14} color="#889397" />
            </div>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}

function PageHeading({
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

function DashboardPage() {
  const dashboard = useGetDashboard();
  const data = dashboard.data;
  const stats = [
    { title: 'Total stores', value: data?.totalStores, foot: 'Across your retail network', icon: Building2 },
    { title: 'Registered shoppers', value: data?.totalShoppers, foot: 'Available in the field program', icon: UsersRound },
    { title: 'Pending verification', value: data?.pendingVerifications, foot: 'Profiles awaiting review', icon: ShieldCheck },
    { title: 'Total tasks', value: data?.totalTasks, foot: 'All visit work created', icon: ClipboardList },
    { title: 'Pending tasks', value: data?.pendingTasks, foot: 'Draft, assigned, in progress, or submitted', icon: Clock3 },
    { title: 'Completed tasks', value: data?.completedTasks, foot: 'Approved visits', icon: ClipboardCheck },
  ];
  return (
    <>
      <PageHeading kicker="Operations overview" title="Dashboard" description="A live view of store coverage, field capacity, and work in progress." />
      {dashboard.isLoading ? (
        <div className="metric-grid">{stats.map((stat) => <div className="panel metric-card" key={stat.title}><div className="skeleton" style={{ width: 90 }} /><div className="skeleton" style={{ width: 75, height: 30, marginTop: 18 }} /></div>)}</div>
      ) : dashboard.isError ? (
        <div className="panel"><StateBlock error onRetry={() => dashboard.refetch()} /></div>
      ) : (
        <>
          <section className="metric-grid">
            {stats.map(({ title, value, foot, icon: Icon }) => (
              <article className="panel metric-card" key={title}>
                <div className="metric-top"><span>{title}</span><span className="metric-icon"><Icon size={16} /></span></div>
                <div className="metric-value">{value ?? 0}</div>
                <div className="metric-foot">{foot}</div>
              </article>
            ))}
          </section>
          <div className="dashboard-grid">
            <section className="panel">
              <header className="section-head">
                <div><h2 className="section-title">Recent tasks</h2><div className="section-kicker">Latest activity across assigned visits</div></div>
                <Link href="/tasks" className="btn btn-sm">All tasks <ArrowUpRight size={14} /></Link>
              </header>
              {data?.recentTasks?.length ? (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Store</th><th>Visit date</th><th>Shopper</th><th>Status</th></tr></thead>
                    <tbody>{data.recentTasks.map((task) => (
                      <tr key={task.id}>
                        <td><Link className="primary-cell" href={`/tasks/${task.id}`}>{task.storeName}<span className="secondary-cell mono">{task.storeCode}</span></Link></td>
                        <td>{formatDate(task.visitDate)}</td>
                        <td>{task.shopperName || 'Unassigned'}</td>
                        <td><Status value={task.status} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <StateBlock empty />}
            </section>
            <section className="panel">
              <header className="section-head"><div><h2 className="section-title">Recent activity</h2><div className="section-kicker">A record of operational changes</div></div></header>
              {data?.recentActivity?.length ? (
                <div className="activity-list">{data.recentActivity.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <div className="activity-dot"><Activity size={13} /></div>
                    <div className="activity-text">{item.description}<span className="activity-time">{formatDateTime(item.createdAt)}</span></div>
                  </div>
                ))}</div>
              ) : <StateBlock empty />}
            </section>
          </div>
        </>
      )}
    </>
  );
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function useNotify() {
  const [message, setMessage] = useState('');
  const notify = (next: string) => {
    setMessage(next);
    window.setTimeout(() => setMessage(''), 2800);
  };
  return { message, notify };
}

function Toast({ message }: { message: string }) {
  return message ? <div className="toast-message" role="status">{message}</div> : null;
}

function StoreForm({
  item,
  onClose,
  onDone,
}: {
  item?: Store;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const create = useCreateStore();
  const update = useUpdateStore();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const busy = create.isPending || update.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const payload: StoreInput = {
      name: String(form.get('name')).trim(),
      code: String(form.get('code')).trim(),
      brandName: String(form.get('brandName')).trim(),
      region: String(form.get('region')).trim(),
      city: String(form.get('city')).trim(),
      address: String(form.get('address')).trim(),
      contactPerson: String(form.get('contactPerson') || '').trim() || null,
      contactPhone: String(form.get('contactPhone') || '').trim() || null,
      status: String(form.get('status')) as StoreInput['status'],
    };
    const done = () => {
      qc.invalidateQueries({ queryKey: getGetStoresQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      if (item) qc.invalidateQueries({ queryKey: getGetStoreQueryKey(item.id) });
      onDone(item ? 'Store details updated.' : 'Store added to your network.');
    };
    const failed = (reason: unknown) => setError(messageOf(reason));
    if (item) update.mutate({ storeId: item.id, data: payload }, { onSuccess: done, onError: failed });
    else create.mutate({ data: payload }, { onSuccess: done, onError: failed });
  };
  return (
    <Modal title={item ? 'Edit store' : 'Add a store'} subtitle="Keep location and contact details current." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Store name" name="name" defaultValue={item?.name} required />
          <Field label="Store code" name="code" defaultValue={item?.code} required />
          <Field label="Brand" name="brandName" defaultValue={item?.brandName} required />
          <Field label="Region" name="region" defaultValue={item?.region} required />
          <Field label="City" name="city" defaultValue={item?.city} required />
          <Field label="Status" name="status" defaultValue={item?.status} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <Field label="Address" name="address" defaultValue={item?.address} required full />
          <Field label="Contact person" name="contactPerson" defaultValue={item?.contactPerson} />
          <Field label="Contact phone" name="contactPhone" defaultValue={item?.contactPhone} type="tel" />
        </div>
        {error && <p className="field-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <FormFooter onClose={onClose} busy={busy} label={item ? 'Save changes' : 'Add store'} />
      </form>
    </Modal>
  );
}

function ShopperForm({ item, onClose, onDone }: { item?: Shopper; onClose: () => void; onDone: (message: string) => void }) {
  const create = useCreateShopper();
  const update = useUpdateShopper();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const busy = create.isPending || update.isPending;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const common = {
      fullName: String(values.get('fullName')).trim(),
      email: String(values.get('email')).trim(),
      phone: String(values.get('phone')).trim(),
      city: String(values.get('city')).trim(),
      experience: Number(values.get('experience')),
    };
    setError('');
    const done = () => {
      qc.invalidateQueries({ queryKey: getGetShoppersQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      if (item) qc.invalidateQueries({ queryKey: getGetShopperQueryKey(item.id) });
      onDone(item ? 'Shopper profile updated.' : 'Shopper profile created.');
    };
    const failed = (reason: unknown) => setError(messageOf(reason));
    if (item) {
      update.mutate({ shopperId: item.id, data: { ...common, accountStatus: String(values.get('accountStatus')) as Shopper['accountStatus'] } }, { onSuccess: done, onError: failed });
    } else {
      const payload: ShopperInput = { ...common };
      create.mutate({ data: payload }, { onSuccess: done, onError: failed });
    }
  };
  return (
    <Modal title={item ? 'Edit shopper' : 'Add mystery shopper'} subtitle="Profile details used for eligibility and field coordination." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Full name" name="fullName" defaultValue={item?.fullName} required />
          <Field label="Email address" name="email" defaultValue={item?.email} type="email" required />
          <Field label="Phone" name="phone" defaultValue={item?.phone} type="tel" required />
          <Field label="City" name="city" defaultValue={item?.city} required />
          <Field label="Years of experience" name="experience" defaultValue={item?.experience ?? 0} type="number" min={0} required />
          {item && <Field label="Account status" name="accountStatus" defaultValue={item.accountStatus} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />}
        </div>
        {error && <p className="field-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <FormFooter onClose={onClose} busy={busy} label={item ? 'Save changes' : 'Create shopper'} />
      </form>
    </Modal>
  );
}

function FormFooter({ onClose, busy, label }: { onClose: () => void; busy: boolean; label: string }) {
  return (
    <footer className="form-footer">
      <button className="btn" type="button" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : label}</button>
    </footer>
  );
}

function messageOf(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function StoresPage() {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<'create' | Store | null>(null);
  const [deleting, setDeleting] = useState<Store | null>(null);
  const stores = useGetStores({ search: search || undefined, region: region || undefined, status: (status || undefined) as 'active' | 'inactive' | undefined });
  const deletion = useDeleteStore();
  const qc = useQueryClient();
  const { message, notify } = useNotify();
  const regions = useMemo(() => Array.from(new Set((stores.data || []).map((store) => store.region).filter(Boolean))), [stores.data]);
  const remove = () => {
    if (!deleting) return;
    deletion.mutate({ storeId: deleting.id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetStoresQueryKey() });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        notify('Store deleted.');
        setDeleting(null);
      },
      onError: () => notify('Store could not be deleted. Try again.'),
    });
  };
  return (
    <>
      <PageHeading kicker="Network directory" title="Stores" description="Manage locations, coverage, and the people on site." action={<button className="btn btn-primary" onClick={() => setModal('create')}><Plus size={15} /> Add store</button>} />
      <section className="panel">
        <div className="toolbar">
          <div className="search-wrap"><Search size={15} /><input className="field" aria-label="Search stores" placeholder="Search by store, code, brand or city" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="select" aria-label="Filter by region" style={{ width: 160 }} value={region} onChange={(event) => setRegion(event.target.value)}><option value="">All regions</option>{regions.map((item) => <option value={item} key={item}>{item}</option>)}</select>
          <select className="select" aria-label="Filter by status" style={{ width: 145 }} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          <Filter size={15} color="#919b9b" />
        </div>
        {stores.isLoading ? <StateBlock loading /> : stores.isError ? <StateBlock error onRetry={() => stores.refetch()} /> : !stores.data?.length ? <StateBlock empty action={<button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>Add first store</button>} /> : (
          <>
            <div className="table-wrap"><table>
              <thead><tr><th>Store</th><th>Brand</th><th>Location</th><th>Contact</th><th>Status</th><th /></tr></thead>
              <tbody>{stores.data.map((store) => (
                <tr key={store.id} data-testid={`row-store-${store.id}`}>
                  <td><Link href={`/stores/${store.id}`} className="primary-cell">{store.name}<span className="secondary-cell mono">{store.code}</span></Link></td>
                  <td>{store.brandName}</td>
                  <td>{store.city}<span className="secondary-cell">{store.region}</span></td>
                  <td>{store.contactPerson || '—'}<span className="secondary-cell">{store.contactPhone || ''}</span></td>
                  <td><Status value={store.status} /></td>
                  <td><div className="row-actions"><button className="icon-button" aria-label={`Edit ${store.name}`} onClick={() => setModal(store)}><MoreHorizontal size={16} /></button><button className="icon-button" aria-label={`Delete ${store.name}`} onClick={() => setDeleting(store)}><X size={14} /></button></div></td>
                </tr>
              ))}</tbody>
            </table></div>
            <div className="pagination"><span>{stores.data.length} stores</span><span>Live network directory</span></div>
          </>
        )}
      </section>
      {modal && <StoreForm item={modal === 'create' ? undefined : modal} onClose={() => setModal(null)} onDone={(text) => { setModal(null); notify(text); }} />}
      {deleting && <Modal title="Delete store?" subtitle={`${deleting.name} will be removed from the store directory.`} onClose={() => setDeleting(null)} width="440px"><p style={{ color: '#748084', fontSize: 12 }}>This action cannot be undone. Existing task records may be affected.</p><div className="form-footer"><button className="btn" onClick={() => setDeleting(null)}>Keep store</button><button className="btn btn-danger" onClick={remove} disabled={deletion.isPending}>{deletion.isPending ? 'Deleting…' : 'Delete store'}</button></div></Modal>}
      <Toast message={message} />
    </>
  );
}

function ShoppersPage() {
  const [search, setSearch] = useState('');
  const [verification, setVerification] = useState('');
  const [account, setAccount] = useState('');
  const [modal, setModal] = useState<'create' | Shopper | null>(null);
  const shoppers = useGetShoppers({ search: search || undefined, verificationStatus: (verification || undefined) as 'pending' | 'verified' | 'rejected' | undefined, accountStatus: (account || undefined) as 'active' | 'inactive' | undefined });
  const [message, setMessage] = useState('');
  const notify = (next: string) => { setMessage(next); window.setTimeout(() => setMessage(''), 2800); };
  return (
    <>
      <PageHeading kicker="Field team" title="Mystery Shoppers" description="Maintain shopper profiles and see their vetting status at a glance." action={<button className="btn btn-primary" onClick={() => setModal('create')}><Plus size={15} /> Add shopper</button>} />
      <section className="panel">
        <div className="toolbar">
          <div className="search-wrap"><Search size={15} /><input className="field" aria-label="Search shoppers" placeholder="Search name, email or city" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="select" aria-label="Filter by verification status" style={{ width: 170 }} value={verification} onChange={(event) => setVerification(event.target.value)}><option value="">All verification</option><option value="pending">Pending</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select>
          <select className="select" aria-label="Filter by account status" style={{ width: 150 }} value={account} onChange={(event) => setAccount(event.target.value)}><option value="">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </div>
        {shoppers.isLoading ? <StateBlock loading /> : shoppers.isError ? <StateBlock error onRetry={() => shoppers.refetch()} /> : !shoppers.data?.length ? <StateBlock empty action={<button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>Add first shopper</button>} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Shopper</th><th>City</th><th>Experience</th><th>Verification</th><th>Account</th><th /></tr></thead>
            <tbody>{shoppers.data.map((shopper) => (
              <tr key={shopper.id} data-testid={`row-shopper-${shopper.id}`}>
                <td><Link href={`/shoppers/${shopper.id}`} className="primary-cell">{shopper.fullName}<span className="secondary-cell">{shopper.email} · {shopper.phone}</span></Link></td>
                <td>{shopper.city}</td><td>{shopper.experience} {shopper.experience === 1 ? 'year' : 'years'}</td><td><Status value={shopper.verificationStatus} /></td><td><Status value={shopper.accountStatus} /></td>
                <td><button className="icon-button" aria-label={`Edit ${shopper.fullName}`} onClick={() => setModal(shopper)}><MoreHorizontal size={16} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {modal && <ShopperForm item={modal === 'create' ? undefined : modal} onClose={() => setModal(null)} onDone={(text) => { setModal(null); notify(text); }} />}
      <Toast message={message} />
    </>
  );
}

function VerificationPage() {
  const shoppers = useGetShoppers({ verificationStatus: 'pending' });
  const decide = useDecideShopperVerification();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<Shopper | null>(null);
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const submitDecision = (shopper: Shopper, decision: 'verified' | 'rejected', note?: string) => {
    setBusyId(shopper.id);
    decide.mutate({ shopperId: shopper.id, data: { verificationStatus: decision, reason: note || null } }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetShoppersQueryKey() });
        qc.invalidateQueries({ queryKey: getGetShopperQueryKey(shopper.id) });
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        setFeedback(`${shopper.fullName} ${decision === 'verified' ? 'approved' : 'rejected'}.`);
        setRejecting(null);
        setReason('');
        setBusyId(null);
        window.setTimeout(() => setFeedback(''), 3000);
      },
      onError: () => { setFeedback('Decision could not be saved. Please try again.'); setBusyId(null); },
    });
  };
  return (
    <>
      <PageHeading kicker="Trust & eligibility" title="Verification" description="Review new shopper profiles before they can be considered for visits." />
      <div className="panel" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 11, color: '#63736f', fontSize: 12 }}>
        <ShieldCheck size={18} color="#50826d" /> Pending profiles are reviewed individually. Rejections include a reason in the shopper record.
      </div>
      {feedback && <div className="notice" role="status" style={{ marginBottom: 15 }}>{feedback}</div>}
      <section className="panel">
        {shoppers.isLoading ? <StateBlock loading /> : shoppers.isError ? <StateBlock error onRetry={() => shoppers.refetch()} /> : !shoppers.data?.length ? (
          <div className="empty-state"><div className="state-icon"><CheckCircle2 size={19} /></div><h3>Review queue is clear</h3><p>New shopper applications will appear here when they need a decision.</p></div>
        ) : (
          <div className="table-wrap"><table>
            <thead><tr><th>Applicant</th><th>City</th><th>Experience</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>{shoppers.data.map((shopper) => (
              <tr key={shopper.id}>
                <td><Link href={`/shoppers/${shopper.id}`} className="primary-cell">{shopper.fullName}<span className="secondary-cell">{shopper.email} · {shopper.phone}</span></Link></td>
                <td>{shopper.city}</td><td>{shopper.experience} {shopper.experience === 1 ? 'year' : 'years'}</td><td>{formatDate(shopper.createdAt)}</td>
                <td><div className="row-actions"><button className="btn btn-sm btn-primary" onClick={() => submitDecision(shopper, 'verified')} disabled={busyId === shopper.id}><Check size={13} /> Approve</button><button className="btn btn-sm btn-danger" onClick={() => setRejecting(shopper)} disabled={busyId === shopper.id}>Reject</button></div></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
       {rejecting && <Modal title="Reject shopper" subtitle={`Add a clear reason for ${rejecting.fullName}.`} onClose={() => setRejecting(null)} width="480px">
        <label className="form-field"><span className="form-label">Rejection reason (optional)</span><textarea className="textarea" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what needs attention" /></label>
        <div className="form-footer"><button className="btn" onClick={() => setRejecting(null)}>Cancel</button><button className="btn btn-danger" disabled={decide.isPending} onClick={() => submitDecision(rejecting, 'rejected', reason.trim())}>{decide.isPending ? 'Saving…' : 'Confirm rejection'}</button></div>
      </Modal>}
    </>
  );
}

function TaskForm({ item, onClose, onDone }: { item?: Task; onClose: () => void; onDone: (message: string) => void }) {
  const stores = useGetStores();
  const shoppers = useGetShoppers({ verificationStatus: 'verified', accountStatus: 'active' });
  const questionnaires = useGetQuestionnaires({ status: 'active' });
  const create = useCreateTask();
  const update = useUpdateTask();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload: TaskInput = {
      storeId: Number(values.get('storeId')),
      shopperId: values.get('shopperId') ? Number(values.get('shopperId')) : null,
      questionnaireId: values.get('questionnaireId') ? Number(values.get('questionnaireId')) : null,
      visitDate: String(values.get('visitDate')),
      dueDate: String(values.get('dueDate')),
      instructions: String(values.get('instructions')).trim(),
      priority: String(values.get('priority')) as TaskInput['priority'],
      status: String(values.get('status')) as TaskInput['status'],
    };
    setError('');
    const done = () => {
      qc.invalidateQueries({ queryKey: getGetTasksQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      if (item) qc.invalidateQueries({ queryKey: getGetTaskQueryKey(item.id) });
      onDone(item ? 'Task updated.' : 'Visit task created.');
    };
    const failed = (reason: unknown) => setError(messageOf(reason));
    if (item) update.mutate({ taskId: item.id, data: payload }, { onSuccess: done, onError: failed });
    else create.mutate({ data: payload }, { onSuccess: done, onError: failed });
  };
  return (
    <Modal title={item ? 'Edit task' : 'Create a visit task'} subtitle="Set the visit scope, timing, and field assignment." onClose={onClose} width="680px">
      {stores.isError || shoppers.isError || questionnaires.isError ? <div className="notice">One or more supporting lists could not be loaded. Close and retry before saving.</div> : null}
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="form-field"><span className="form-label">Store *</span><select className="select" name="storeId" defaultValue={item?.storeId ?? ''} required><option value="" disabled>Select a store</option>{stores.data?.map((store) => <option key={store.id} value={store.id}>{store.name} · {store.code}</option>)}</select></label>
          <label className="form-field"><span className="form-label">Eligible shopper</span><select className="select" name="shopperId" defaultValue={item?.shopperId ?? ''}><option value="">Leave unassigned</option>{shoppers.data?.map((shopper) => <option key={shopper.id} value={shopper.id}>{shopper.fullName} · {shopper.city}</option>)}</select></label>
          <label className="form-field"><span className="form-label">Questionnaire</span><select className="select" name="questionnaireId" defaultValue={item?.questionnaireId ?? ''}><option value="">No questionnaire</option>{questionnaires.data?.map((questionnaire) => <option key={questionnaire.id} value={questionnaire.id}>{questionnaire.title}</option>)}</select></label>
          <Field label="Visit date" name="visitDate" type="date" defaultValue={item?.visitDate?.slice(0, 10)} required />
          <Field label="Due date" name="dueDate" type="date" defaultValue={item?.dueDate?.slice(0, 10)} required />
          <Field label="Priority" name="priority" defaultValue={item?.priority || 'medium'} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} />
          <Field label="Status" name="status" defaultValue={item?.status || 'draft'} options={[{ value: 'draft', label: 'Draft' }, { value: 'assigned', label: 'Assigned' }, { value: 'in_progress', label: 'In progress' }, { value: 'submitted', label: 'Submitted' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' }]} />
          <Field label="Instructions" name="instructions" type="textarea" defaultValue={item?.instructions} required full placeholder="What should the shopper observe during this visit?" />
        </div>
        {error && <p className="field-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <FormFooter onClose={onClose} busy={create.isPending || update.isPending} label={item ? 'Save changes' : 'Create task'} />
      </form>
    </Modal>
  );
}

function TasksPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<'create' | Task | null>(null);
  const tasks = useGetTasks({ search: search || undefined, status: (status || undefined) as Task['status'] | undefined });
  const [notice, setNotice] = useState('');
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2800); };
  return (
    <>
      <PageHeading kicker="Field execution" title="Tasks" description="Plan visits and follow progress from assignment through completion." action={<button className="btn btn-primary" onClick={() => setModal('create')}><Plus size={15} /> Create task</button>} />
      <section className="panel">
        <div className="toolbar"><div className="search-wrap"><Search size={15} /><input className="field" aria-label="Search tasks" placeholder="Search store, shopper or task instructions" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="select" aria-label="Filter tasks by status" style={{ width: 165 }} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{['draft', 'assigned', 'in_progress', 'submitted', 'approved', 'rejected', 'cancelled'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select>
        </div>
        {tasks.isLoading ? <StateBlock loading /> : tasks.isError ? <StateBlock error onRetry={() => tasks.refetch()} /> : !tasks.data?.length ? <StateBlock empty action={<button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>Create first task</button>} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Store</th><th>Shopper</th><th>Visit date</th><th>Due date</th><th>Priority</th><th>Status</th><th /></tr></thead>
            <tbody>{tasks.data.map((task) => (
              <tr key={task.id}>
                <td><Link href={`/tasks/${task.id}`} className="primary-cell">{task.storeName}<span className="secondary-cell mono">{task.storeCode}</span></Link></td>
                <td>{task.shopperName || <span style={{ color: '#a0a8a7' }}>Unassigned</span>}</td><td>{formatDate(task.visitDate)}</td><td>{formatDate(task.dueDate)}</td><td><Status value={task.priority} /></td><td><Status value={task.status} /></td>
                <td><button className="icon-button" aria-label={`Edit task at ${task.storeName}`} onClick={() => setModal(task)}><MoreHorizontal size={16} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {modal && <TaskForm item={modal === 'create' ? undefined : modal} onClose={() => setModal(null)} onDone={(text) => { setModal(null); notify(text); }} />}
      <Toast message={notice} />
    </>
  );
}

type DraftQuestion = { prompt: string; type: 'text' | 'single_choice' | 'yes_no' | 'rating'; required: boolean; options: string };

function QuestionnaireForm({ item, onClose, onDone }: { item?: Questionnaire; onClose: () => void; onDone: (message: string) => void }) {
  const create = useCreateQuestionnaire();
  const update = useUpdateQuestionnaire();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>(item?.questions?.map((question) => ({ prompt: question.prompt, type: question.type, required: question.required, options: question.options.join('\n') })) || []);
  const addQuestion = () => setQuestions((current) => [...current, { prompt: '', type: 'text', required: false, options: '' }]);
  const removeQuestion = (index: number) => setQuestions((current) => current.filter((_, itemIndex) => index !== itemIndex));
  const changeQuestion = (index: number, updates: Partial<DraftQuestion>) => setQuestions((current) => current.map((question, itemIndex) => itemIndex === index ? { ...question, ...updates } : question));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const payload: QuestionnaireInput = {
      title: String(values.get('title')).trim(),
      description: String(values.get('description')).trim(),
      status: String(values.get('status')) as QuestionnaireInput['status'],
      questions: questions.map((question, position) => ({
        prompt: question.prompt.trim(),
        type: question.type,
        required: question.required,
        position,
        options: question.type === 'single_choice' ? question.options.split('\n').map((option) => option.trim()).filter(Boolean) : [],
      })),
    };
    if (payload.questions.some((question) => !question.prompt)) {
      setError('Add a prompt to every question before saving.');
      return;
    }
    if (payload.questions.some((question) => question.type === 'single_choice' && question.options.length < 2)) {
      setError('Single choice questions need at least two options.');
      return;
    }
    setError('');
    const done = () => {
      qc.invalidateQueries({ queryKey: getGetQuestionnairesQueryKey() });
      if (item) qc.invalidateQueries({ queryKey: getGetQuestionnaireQueryKey(item.id) });
      onDone(item ? 'Questionnaire updated.' : 'Questionnaire created.');
    };
    const failed = (reason: unknown) => setError(messageOf(reason));
    if (item) update.mutate({ questionnaireId: item.id, data: payload }, { onSuccess: done, onError: failed });
    else create.mutate({ data: payload }, { onSuccess: done, onError: failed });
  };
  return (
    <Modal title={item ? 'Edit questionnaire' : 'Create questionnaire'} subtitle="Build a consistent guide for every field visit." onClose={onClose} width="760px">
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Title" name="title" defaultValue={item?.title} required />
          <Field label="Status" name="status" defaultValue={item?.status || 'inactive'} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <Field label="Description" name="description" type="textarea" defaultValue={item?.description} full />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 22 }}>
          <div><h3 className="section-title">Questions <span style={{ color: '#9ba4a2', fontWeight: 500 }}>({questions.length})</span></h3><div className="section-kicker">Ordered as shoppers will see them</div></div>
          <button className="btn btn-sm" type="button" onClick={addQuestion}><Plus size={13} /> Add question</button>
        </div>
        {questions.map((question, index) => (
          <div key={index} className="question-row" style={{ display: 'block' }}>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center', marginBottom: 10 }}>
              <span className="question-num">{String(index + 1).padStart(2, '0')}</span>
              <input className="field" aria-label={`Question ${index + 1} prompt`} value={question.prompt} placeholder="Write a clear observation prompt" onChange={(event) => changeQuestion(index, { prompt: event.target.value })} />
              <button className="icon-button" type="button" aria-label={`Remove question ${index + 1}`} onClick={() => removeQuestion(index)}><X size={14} /></button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', paddingLeft: 32 }}>
              <select className="select" aria-label={`Question ${index + 1} type`} style={{ maxWidth: 180 }} value={question.type} onChange={(event) => changeQuestion(index, { type: event.target.value as DraftQuestion['type'] })}>
                <option value="text">Text response</option><option value="single_choice">Single choice</option><option value="yes_no">Yes / no</option><option value="rating">Rating</option>
              </select>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#637075' }}><input type="checkbox" checked={question.required} onChange={(event) => changeQuestion(index, { required: event.target.checked })} /> Required</label>
            </div>
            {question.type === 'single_choice' && <textarea className="textarea" style={{ minHeight: 56, marginTop: 10 }} aria-label={`Question ${index + 1} answer options`} value={question.options} onChange={(event) => changeQuestion(index, { options: event.target.value })} placeholder="Enter one answer option per line" />}
          </div>
        ))}
        {error && <p className="field-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
        <FormFooter onClose={onClose} busy={create.isPending || update.isPending} label={item ? 'Save questionnaire' : 'Create questionnaire'} />
      </form>
    </Modal>
  );
}

function QuestionnairesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState<'create' | Questionnaire | null>(null);
  const questionnaires = useGetQuestionnaires({ search: search || undefined, status: (status || undefined) as 'active' | 'inactive' | undefined });
  const [message, setMessage] = useState('');
  const notify = (text: string) => { setMessage(text); window.setTimeout(() => setMessage(''), 2800); };
  return (
    <>
      <PageHeading kicker="Visit standards" title="Questionnaires" description="Create structured guides that keep every shopper observation consistent." action={<button className="btn btn-primary" onClick={() => setModal('create')}><Plus size={15} /> New questionnaire</button>} />
      <section className="panel">
        <div className="toolbar"><div className="search-wrap"><Search size={15} /><input className="field" aria-label="Search questionnaires" placeholder="Search title or description" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="select" aria-label="Filter questionnaires by status" style={{ width: 155 }} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
        </div>
        {questionnaires.isLoading ? <StateBlock loading /> : questionnaires.isError ? <StateBlock error onRetry={() => questionnaires.refetch()} /> : !questionnaires.data?.length ? <StateBlock empty action={<button className="btn btn-primary btn-sm" onClick={() => setModal('create')}>Create first questionnaire</button>} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Questionnaire</th><th>Questions</th><th>Last updated</th><th>Status</th><th /></tr></thead>
            <tbody>{questionnaires.data.map((questionnaire) => (
              <tr key={questionnaire.id}>
                <td><Link href={`/questionnaires/${questionnaire.id}`} className="primary-cell">{questionnaire.title}<span className="secondary-cell">{questionnaire.description || 'No description'}</span></Link></td>
                <td>{questionnaire.questions.length} {questionnaire.questions.length === 1 ? 'question' : 'questions'}</td>
                <td>{formatDate(questionnaire.updatedAt)}</td><td><Status value={questionnaire.status} /></td>
                <td><button className="icon-button" aria-label={`Edit ${questionnaire.title}`} onClick={() => setModal(questionnaire)}><MoreHorizontal size={16} /></button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {modal && <QuestionnaireForm item={modal === 'create' ? undefined : modal} onClose={() => setModal(null)} onDone={(text) => { setModal(null); notify(text); }} />}
      <Toast message={message} />
    </>
  );
}

function DetailPage({ kind, id }: { kind: Entity; id: number }) {
  if (kind === 'stores') return <StoreDetail id={id} />;
  if (kind === 'shoppers') return <ShopperDetail id={id} />;
  if (kind === 'tasks') return <TaskDetail id={id} />;
  return <QuestionnaireDetail id={id} />;
}

function StoreDetail({ id }: { id: number }) {
  const query = useGetStore(id, { query: { queryKey: getGetStoreQueryKey(id), enabled: Number.isFinite(id) } });
  const store = query.data;
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState('');
  return (
    <>
      <PageHeading kicker="Store record" title={store?.name || 'Store details'} description={store ? `${store.brandName} · ${store.code}` : 'Review location and contact information.'} action={<Link href="/stores" className="btn"><ArrowLeft size={14} /> Back to stores</Link>} />
      {query.isLoading ? <div className="panel"><StateBlock loading /></div> : query.isError ? <div className="panel"><StateBlock error onRetry={() => query.refetch()} /></div> : store ? (
        <div className="detail-layout"><section className="panel detail-main"><div className="detail-list">
          <DetailItem label="Store name" value={store.name} /><DetailItem label="Store code" value={store.code} mono />
          <DetailItem label="Brand" value={store.brandName} /><DetailItem label="Status" value={<Status value={store.status} />} />
          <DetailItem label="Region" value={store.region} /><DetailItem label="City" value={store.city} />
          <DetailItem label="Address" value={store.address} /><DetailItem label="Contact person" value={store.contactPerson || '—'} />
          <DetailItem label="Contact phone" value={store.contactPhone || '—'} />
        </div><div className="detail-actions"><button className="btn btn-primary" onClick={() => setModal(true)}>Edit store</button></div></section>
          <aside className="panel detail-side"><h2 className="section-title">Record history</h2><div className="section-kicker" style={{ marginBottom: 20 }}>Store directory entry</div><DetailItem label="Created" value={formatDateTime(store.createdAt)} /><div style={{ marginTop: 18 }}><DetailItem label="Last updated" value={formatDateTime(store.updatedAt)} /></div></aside>
        </div>
      ) : null}
      {modal && <StoreForm item={store} onClose={() => setModal(false)} onDone={(message) => { setModal(false); setToast(message); window.setTimeout(() => setToast(''), 2800); }} />}
      <Toast message={toast} />
    </>
  );
}

function DetailItem({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return <div className="detail-item"><label>{label}</label><div className={mono ? 'mono' : ''}>{value}</div></div>;
}

function ShopperDetail({ id }: { id: number }) {
  const query = useGetShopper(id, { query: { queryKey: getGetShopperQueryKey(id), enabled: Number.isFinite(id) } });
  const shopper = query.data;
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState('');
  return (
    <>
      <PageHeading kicker="Shopper profile" title={shopper?.fullName || 'Shopper details'} description={shopper?.email || 'Review profile and verification history.'} action={<Link href="/shoppers" className="btn"><ArrowLeft size={14} /> Back to shoppers</Link>} />
      {query.isLoading ? <div className="panel"><StateBlock loading /></div> : query.isError ? <div className="panel"><StateBlock error onRetry={() => query.refetch()} /></div> : shopper ? (
        <div className="detail-layout"><section className="panel detail-main"><div className="detail-list">
          <DetailItem label="Full name" value={shopper.fullName} /><DetailItem label="Email" value={shopper.email} />
          <DetailItem label="Phone" value={shopper.phone} /><DetailItem label="City" value={shopper.city} />
          <DetailItem label="Experience" value={`${shopper.experience} ${shopper.experience === 1 ? 'year' : 'years'}`} />
          <DetailItem label="Verification" value={<Status value={shopper.verificationStatus} />} /><DetailItem label="Account" value={<Status value={shopper.accountStatus} />} />
          {shopper.decisionReason && <DetailItem label="Decision reason" value={shopper.decisionReason} />}
          {shopper.decisionAt && <DetailItem label="Decision date" value={formatDateTime(shopper.decisionAt)} />}
        </div><div className="detail-actions"><button className="btn btn-primary" onClick={() => setModal(true)}>Edit profile</button></div></section>
          <aside className="panel detail-side"><h2 className="section-title">Profile history</h2><div className="section-kicker" style={{ marginBottom: 20 }}>Shopper record</div><DetailItem label="Joined" value={formatDateTime(shopper.createdAt)} /><div style={{ marginTop: 18 }}><DetailItem label="Last updated" value={formatDateTime(shopper.updatedAt)} /></div></aside>
        </div>
      ) : null}
      {modal && <ShopperForm item={shopper} onClose={() => setModal(false)} onDone={(message) => { setModal(false); setToast(message); window.setTimeout(() => setToast(''), 2800); }} />}
      <Toast message={toast} />
    </>
  );
}

function TaskDetail({ id }: { id: number }) {
  const query = useGetTask(id, { query: { queryKey: getGetTaskQueryKey(id), enabled: Number.isFinite(id) } });
  const task = query.data;
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState('');
  return (
    <>
      <PageHeading kicker="Visit task" title={task ? task.storeName : 'Task details'} description={task ? `Task #${task.id} · ${task.storeCode}` : 'Review assignment and visit requirements.'} action={<Link href="/tasks" className="btn"><ArrowLeft size={14} /> Back to tasks</Link>} />
      {query.isLoading ? <div className="panel"><StateBlock loading /></div> : query.isError ? <div className="panel"><StateBlock error onRetry={() => query.refetch()} /></div> : task ? (
        <div className="detail-layout"><section className="panel detail-main"><div className="detail-list">
          <DetailItem label="Store" value={task.storeName} /><DetailItem label="Store code" value={task.storeCode} mono />
          <DetailItem label="Shopper" value={task.shopperName || 'Unassigned'} /><DetailItem label="Questionnaire" value={task.questionnaireTitle || 'None selected'} />
          <DetailItem label="Visit date" value={formatDate(task.visitDate)} /><DetailItem label="Due date" value={formatDate(task.dueDate)} />
          <DetailItem label="Priority" value={<Status value={task.priority} />} /><DetailItem label="Status" value={<Status value={task.status} />} />
          <DetailItem label="Instructions" value={task.instructions || '—'} />
        </div><div className="detail-actions"><button className="btn btn-primary" onClick={() => setModal(true)}>Edit task</button></div></section>
          <aside className="panel detail-side"><h2 className="section-title">Task timeline</h2><div className="section-kicker" style={{ marginBottom: 20 }}>Visit coordination</div><DetailItem label="Created" value={formatDateTime(task.createdAt)} /><div style={{ marginTop: 18 }}><DetailItem label="Last updated" value={formatDateTime(task.updatedAt)} /></div></aside>
        </div>
      ) : null}
      {modal && <TaskForm item={task} onClose={() => setModal(false)} onDone={(message) => { setModal(false); setToast(message); window.setTimeout(() => setToast(''), 2800); }} />}
      <Toast message={toast} />
    </>
  );
}

function QuestionnaireDetail({ id }: { id: number }) {
  const query = useGetQuestionnaire(id, { query: { queryKey: getGetQuestionnaireQueryKey(id), enabled: Number.isFinite(id) } });
  const questionnaire = query.data;
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState('');
  return (
    <>
      <PageHeading kicker="Questionnaire record" title={questionnaire?.title || 'Questionnaire details'} description={questionnaire?.description || 'Review structured visit questions.'} action={<Link href="/questionnaires" className="btn"><ArrowLeft size={14} /> Back to questionnaires</Link>} />
      {query.isLoading ? <div className="panel"><StateBlock loading /></div> : query.isError ? <div className="panel"><StateBlock error onRetry={() => query.refetch()} /></div> : questionnaire ? (
        <div className="detail-layout"><section className="panel detail-main"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}><div><h2 className="section-title">Question sequence</h2><div className="section-kicker">{questionnaire.questions.length} prompts · ordered for the shopper</div></div><Status value={questionnaire.status} /></div>
          {questionnaire.questions.map((question, index) => <div className="question-row" key={question.id}><div><span className="question-num">{String(index + 1).padStart(2, '0')}</span><span className="question-prompt">{question.prompt}</span><div className="question-meta">{question.type.replaceAll('_', ' ')}{question.required ? ' · Required' : ' · Optional'}{question.options?.length ? ` · ${question.options.join(', ')}` : ''}</div></div></div>)}
          {!questionnaire.questions.length && <p className="page-desc" style={{ paddingTop: 20 }}>No questions have been added.</p>}
          <div className="detail-actions"><button className="btn btn-primary" onClick={() => setModal(true)}>Edit questionnaire</button></div>
        </section><aside className="panel detail-side"><h2 className="section-title">Questionnaire record</h2><div className="section-kicker" style={{ marginBottom: 20 }}>Visit standard</div><DetailItem label="Created" value={formatDateTime(questionnaire.createdAt)} /><div style={{ marginTop: 18 }}><DetailItem label="Last updated" value={formatDateTime(questionnaire.updatedAt)} /></div></aside></div>
      ) : null}
      {modal && <QuestionnaireForm item={questionnaire} onClose={() => setModal(false)} onDone={(message) => { setModal(false); setToast(message); window.setTimeout(() => setToast(''), 2800); }} />}
      <Toast message={toast} />
    </>
  );
}

function OutsideMilestone({ section }: { section: 'Reports' | 'Settings' }) {
  return (
    <>
      <PageHeading kicker="Workspace" title={section} description={section === 'Reports' ? 'Reporting is planned for a later milestone.' : 'Workspace preferences are planned for a later milestone.'} />
      <section className="panel" style={{ padding: 30, maxWidth: 670 }}>
        <div className="state-icon"><Clock3 size={19} /></div>
        <h2 className="section-title" style={{ fontSize: 17, marginBottom: 8 }}>{section} are outside this first milestone</h2>
        <p className="page-desc" style={{ lineHeight: 1.65, maxWidth: 470 }}>This area is intentionally not available yet. Your active store, shopper, verification, task, and questionnaire workflows remain available from the navigation.</p>
        <Link className="btn btn-primary" href="/">Return to dashboard</Link>
      </section>
    </>
  );
}

export function Workspace() {
  const [path] = useLocation();
  const normalizedPath = path;
  const section = normalizedPath.split('/').filter(Boolean)[0];
  const idSegment = normalizedPath.split('/').filter(Boolean)[1];
  const id = idSegment ? Number(idSegment) : NaN;
  let page: React.ReactNode;
  if (normalizedPath === '/') page = <DashboardPage />;
  else if (normalizedPath === '/stores') page = <StoresPage />;
  else if (normalizedPath === '/shoppers') page = <ShoppersPage />;
  else if (normalizedPath === '/verification') page = <VerificationPage />;
  else if (normalizedPath === '/tasks') page = <TasksPage />;
  else if (normalizedPath === '/questionnaires') page = <QuestionnairesPage />;
  else if (normalizedPath === '/reports') page = <OutsideMilestone section="Reports" />;
  else if (normalizedPath === '/settings') page = <OutsideMilestone section="Settings" />;
  else if (idSegment && Number.isFinite(id) && ['stores', 'shoppers', 'tasks', 'questionnaires'].includes(section || '')) page = <DetailPage kind={section as Entity} id={id} />;
  else page = <div className="panel"><StateBlock error /></div>;
  return <WorkspaceShell>{page}</WorkspaceShell>;
}
