import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router';
import { PublicLayout } from './components/layout/PublicLayout.jsx';
import { Spinner } from './components/ui/Feedback.jsx';
import Home from './pages/Home.jsx';

// Everything except the landing page loads on demand, so first visits on slow
// networks download only what the home page needs.
const Register = lazy(() => import('./pages/Register.jsx'));
const Status = lazy(() => import('./pages/Status.jsx'));
const Opportunities = lazy(() => import('./pages/Opportunities.jsx'));
const OpportunityDetail = lazy(() => import('./pages/OpportunityDetail.jsx'));
const Legal = lazy(() => import('./pages/Legal.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Portal = lazy(() => import('./portal/Portal.jsx'));
const AdminApp = lazy(() => import('./admin/AdminApp.jsx'));

const fallback = <Spinner className="min-h-[60vh]" />;

export function App() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Home />} />
          <Route path="register" element={<Register />} />
          <Route path="volunteer" element={<Navigate to="/register" replace />} />
          <Route path="status" element={<Status />} />
          <Route path="opportunities" element={<Opportunities />} />
          <Route path="opportunities/:id" element={<OpportunityDetail />} />
          <Route path="privacy" element={<Legal page="privacy" />} />
          <Route path="terms" element={<Legal page="terms" />} />
          <Route path="portal/*" element={<Portal />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/*" element={<AdminApp />} />
      </Routes>
    </Suspense>
  );
}
