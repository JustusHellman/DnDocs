import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CampaignDataProvider } from './contexts/CampaignDataContext';
import { PeekProvider } from './contexts/PeekContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { FullPageSpinner } from './components/ui/bits';
import AppShell from './components/layout/AppShell';
import Login from './pages/Login';
import CampaignDashboard from './pages/CampaignDashboard';
import Home from './pages/Home';
import EntityPage from './pages/EntityPage';
import EntityList from './pages/EntityList';

// Heavier / less used pages are split into their own chunks.
const EntityEdit = lazy(() => import('./pages/EntityEdit'));
const WorldMap = lazy(() => import('./pages/WorldMap'));
const Members = lazy(() => import('./pages/Members'));
const DMTools = lazy(() => import('./pages/DMTools'));
const Chronicle = lazy(() => import('./pages/Chronicle'));
const EntryTypes = lazy(() => import('./pages/EntryTypes'));
const JoinCampaign = lazy(() => import('./pages/JoinCampaign'));

/** Remount the editor whenever the edited entry (or "new" type) changes. */
function EditRoute() {
  const { pathname, search } = useLocation();
  return <EntityEdit key={pathname + search} />;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner label="Opening the archives…" />;
  if (!user) return <Login />;
  return <>{children}</>;
}

function CampaignGate() {
  const { currentCampaign } = useAuth();
  if (!currentCampaign) return <CampaignDashboard />;
  return (
    <CampaignDataProvider>
      <PeekProvider>
        <AppShell />
      </PeekProvider>
    </CampaignDataProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <HashRouter>
              <Suspense fallback={<FullPageSpinner />}>
                <Routes>
                  <Route
                    path="/join/:code"
                    element={
                      <RequireAuth>
                        <JoinCampaign />
                      </RequireAuth>
                    }
                  />
                  <Route
                    element={
                      <RequireAuth>
                        <CampaignGate />
                      </RequireAuth>
                    }
                  >
                    <Route index element={<Navigate to="/search" replace />} />
                    <Route path="search" element={<Home />} />
                    <Route path="entities/:type" element={<EntityList />} />
                    <Route path="entity/new" element={<EditRoute />} />
                    <Route path="entity/:id" element={<EntityPage />} />
                    <Route path="entity/:id/edit" element={<EditRoute />} />
                    <Route path="chronicle" element={<Chronicle />} />
                    <Route path="types" element={<EntryTypes />} />
                    <Route path="players" element={<Members />} />
                    <Route path="tools" element={<DMTools />} />
                    <Route path="map/:id?" element={<WorldMap />} />
                    <Route path="*" element={<Navigate to="/search" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </HashRouter>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
