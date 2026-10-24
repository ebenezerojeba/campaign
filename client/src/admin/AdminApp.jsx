import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, m } from 'framer-motion';
import { LayoutDashboard, Users, ScrollText, UserCog, LogOut, Menu, X, Eye, ExternalLink, MapPinned, KeyRound } from 'lucide-react';
import { Logo } from '../components/brand/Logo.jsx';
import { Alert, Dialog, Spinner } from '../components/ui/Feedback.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { api } from '../lib/api.js';
import { cx } from '../lib/format.js';
import { AdminContext, useAdminApiFactory, can, useAdmin } from './context.jsx';
import Login from './pages/Login.jsx';

const Overview = lazy(() => import('./pages/Overview.jsx'));
const Agents = lazy(() => import('./pages/Agents.jsx'));
const AgentDetail = lazy(() => import('./pages/AgentDetail.jsx'));
const Audit = lazy(() => import('./pages/Audit.jsx'));
const Staff = lazy(() => import('./pages/Staff.jsx'));
const Positions = lazy(() => import('./pages/Positions.jsx'));

const NAV = [
  { to: '', label: 'Overview', icon: LayoutDashboard, permission: 'agents:read', end: true },
  { to: 'agents', label: 'Registrations', icon: Users, permission: 'agents:read' },
  { to: 'positions', label: 'Contested positions', icon: MapPinned, permission: 'agents:read' },
  { to: 'audit', label: 'Audit log', icon: ScrollText, permission: 'audit:read' },
  { to: 'staff', label: 'Staff accounts', icon: UserCog, permission: 'staff:manage' },
];

function Sidebar({ onNavigate }) {
  const { user, base } = useAdmin();
  return (
    <nav aria-label="Administration" className="flex flex-1 flex-col gap-1 px-3">
      {NAV.filter((n) => can(user, n.permission)).map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={label}
          to={to ? `${base}/${to}` : base}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) => cx('flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15px] font-medium transition-colors', isActive ? 'bg-white/10 text-white' : 'text-green-50/70 hover:bg-white/5 hover:text-white')}
        >
          {({ isActive }) => (
            <>
              <Icon className={cx('size-5', isActive ? 'text-gold-500' : '')} aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

// Lets the signed-in staff member change their own password.
function PasswordDialog({ onClose }) {
  const { api } = useAdmin();
  const notify = useToast();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (name) => (e) => setValues((v) => ({ ...v, [name]: e.target.value }));

  const save = async () => {
    setErrors({});
    setError(null);
    if (values.newPassword !== values.confirm) { setErrors({ confirm: 'The two new passwords do not match' }); return; }
    setBusy(true);
    try {
      await api.post('/auth/password', { currentPassword: values.currentPassword, newPassword: values.newPassword });
      notify('Password changed. You were signed out everywhere else.');
      onClose();
    } catch (err) {
      setErrors(err.fields ?? {});
      if (!Object.keys(err.fields ?? {}).length) setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Change your password" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={KeyRound} loading={busy} onClick={save}>Change password</Button>
      </>
    }>
      <div className="grid gap-4">
        <TextField label="Current password" type="password" autoComplete="current-password" value={values.currentPassword} onChange={set('currentPassword')} error={errors.currentPassword} />
        <TextField label="New password" type="password" autoComplete="new-password" hint="At least 12 characters. A few unrelated words work well." value={values.newPassword} onChange={set('newPassword')} error={errors.newPassword} />
        <TextField label="Repeat the new password" type="password" autoComplete="new-password" value={values.confirm} onChange={set('confirm')} error={errors.confirm} />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}

function Shell() {
  const { user, signOut, demo, base } = useAdmin();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);

  const sidebarInner = (
    <>
      <div className="px-5 pb-6 pt-5"><Logo tone="light" to={base} /></div>
      <Sidebar onNavigate={() => setOpen(false)} />
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-semibold text-white">{user.name}</p>
        <p className="truncate text-xs capitalize text-green-50/60">{user.role}</p>
        {!demo && (
          <button type="button" onClick={() => setChangingPassword(true)} className="mt-3 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-green-50/80 hover:bg-white/5 hover:text-white">
            <KeyRound className="size-4" aria-hidden />Change password
          </button>
        )}
        <button type="button" onClick={signOut} className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-green-50/80 hover:bg-white/5 hover:text-white">
          <LogOut className="size-4" aria-hidden />{demo ? 'Leave preview' : 'Sign out'}
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#F4F7F5]">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-gold-500 focus:px-4 focus:py-2 focus:font-semibold">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-forest-900 lg:flex">{sidebarInner}</aside>

      <AnimatePresence>
        {open && (
          <>
            <m.div className="fixed inset-0 z-40 bg-forest-950/50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <m.aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-forest-900 lg:hidden" initial={{ x: -288 }} animate={{ x: 0 }} exit={{ x: -288 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} aria-label="Menu">
              <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-md p-2 text-white hover:bg-white/10" aria-label="Close menu"><X className="size-5" aria-hidden /></button>
              {sidebarInner}
            </m.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        {demo && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#5B3E8E] px-4 py-2 text-center text-sm font-medium text-white">
            <Eye className="size-4" aria-hidden />
            Demonstration preview: every record shown is fictional sample data. Changes are switched off.
          </div>
        )}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button type="button" onClick={() => setOpen(true)} className="rounded-md p-2 text-forest-900 hover:bg-mist lg:hidden" aria-label="Open menu" aria-expanded={open}><Menu className="size-6" aria-hidden /></button>
          <p className="hidden text-sm text-slate-500 lg:block">Polling unit agent registration administration</p>
          <Link to="/" target="_blank" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-semibold text-green-700 hover:bg-mist">View public site<ExternalLink className="size-3.5" aria-hidden /></Link>
        </header>
        <main id="admin-main" className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<Spinner />}><Outlet /></Suspense>
        </main>
        {changingPassword && <PasswordDialog onClose={() => setChangingPassword(false)} />}
      </div>
    </div>
  );
}

function Guard({ permission, children }) {
  const { user } = useAdmin();
  return can(user, permission) ? children : <p className="text-slate-600">You do not have access to this page.</p>;
}

function AdminRoutes() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:id" element={<AgentDetail />} />
        <Route path="positions" element={<Positions />} />
        <Route path="audit" element={<Guard permission="audit:read"><Audit /></Guard>} />
        <Route path="staff" element={<Guard permission="staff:manage"><Staff /></Guard>} />
        <Route path="*" element={<p className="text-slate-600">This page does not exist.</p>} />
      </Route>
    </Routes>
  );
}

// Authenticated admin: confirms the session with the server before rendering anything.
function Authenticated() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(undefined);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const expire = useCallback(() => {
    setUser(null);
    navigate(`/admin/login?expired=1&next=${encodeURIComponent(pathRef.current)}`, { replace: true });
  }, [navigate]);

  useEffect(() => {
    api('/admin/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const rawApi = useAdminApiFactory(false);
  // Any 401 mid-session (expired or revoked) returns the user to sign-in.
  const adminApi = useMemo(() => {
    const wrap = (fn) => (...args) => fn(...args).catch((err) => {
      if (err.status === 401) expire();
      throw err;
    });
    return Object.fromEntries(Object.entries(rawApi).map(([k, fn]) => [k, wrap(fn)]));
  }, [rawApi, expire]);

  const signOut = useCallback(async () => {
    await api('/admin/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  if (user === undefined) return <Spinner label="Checking your session" className="min-h-screen" />;
  if (user === null) return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;

  return (
    <AdminContext.Provider value={{ user, api: adminApi, signOut, demo: false, base: '/admin' }}>
      <AdminRoutes />
    </AdminContext.Provider>
  );
}

function Preview() {
  const navigate = useNavigate();
  const [mod, setMod] = useState(null);
  useEffect(() => { import('./demoData.js').then(setMod); }, []);
  const adminApi = useAdminApiFactory(true, mod?.demoGet);
  if (!mod) return <Spinner label="Loading preview" className="min-h-screen" />;
  return (
    <AdminContext.Provider value={{ user: mod.DEMO_USER, api: adminApi, signOut: () => navigate('/admin/login'), demo: true, base: '/admin/preview' }}>
      <AdminRoutes />
    </AdminContext.Provider>
  );
}

export default function AdminApp() {
  useEffect(() => {
    document.title = 'Administration · APC Lagos Polling Unit Agent Registration';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => { meta.remove(); document.title = 'APC Lagos Polling Unit Agent Registration'; };
  }, []);
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="preview/*" element={<Preview />} />
      <Route path="*" element={<Authenticated />} />
    </Routes>
  );
}
