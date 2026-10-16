import { type ReactNode } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Workspace } from '@/components/workspace';
import { LoginPage, RegisterPage } from '@/pages/auth';
import { LandingPage } from '@/pages/landing';
import NotFound from '@/pages/not-found';
import { AppQueryProvider, AuthProvider, useAuth } from '@/lib/auth';
import { PreferencesProvider } from '@/lib/format';

function Splash({ label }: { label: string }) {
  return (
    <div className="auth-screen">
      <div className="auth-splash">
        <Loader2 size={20} className="spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

/** Blocks the workspace until the stored session has been verified. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) return <Splash label="Restoring your session…" />;
  if (!user) {
    const redirect = location && location !== '/' ? `?next=${encodeURIComponent(location)}` : '';
    return <Redirect to={`/login${redirect}`} />;
  }
  return <>{children}</>;
}

/**
 * The public landing page. Signed-in visitors see their own dashboard at "/",
 * so the marketing page lives at /welcome and is also what guests see at "/".
 */
function PublicHome() {
  const { user, loading } = useAuth();
  if (loading) return <Splash label="Loading Ricoz…" />;
  if (user) {
    return (
      <RequireAuth>
        <Workspace />
      </RequireAuth>
    );
  }
  return <LandingPage />;
}

/** Keeps signed-in users away from the login/register screens. */
function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash label="Checking your session…" />;
  if (user) return <Redirect to="/" />;
  return <>{children}</>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

const workspaceRoutes = [
  '/',
  '/stores',
  '/stores/:id',
  '/shoppers',
  '/shoppers/:id',
  '/verification',
  '/tasks',
  '/tasks/:id',
  '/questionnaires',
  '/questionnaires/:id',
  '/reports',
  '/users',
  '/settings',
  '/my-work',
  '/assignments',
  '/assignments/:id',
  '/submissions',
  '/submissions/:id',
  '/reviews',
  '/reviews/queue',
  '/reviews/history',
  '/region',
  '/region/scorecards',
  '/region/comparison',
  '/region/trends',
];

function App() {
  return (
    <AppQueryProvider>
      <AuthProvider>
        <PreferencesProvider>
          <TooltipProvider>
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/welcome">
                  <LandingPage />
                </Route>
                <Route path="/login">
                  <RedirectIfSignedIn>
                    <LoginPage />
                  </RedirectIfSignedIn>
                </Route>
                <Route path="/register">
                  <RedirectIfSignedIn>
                    <RegisterPage />
                  </RedirectIfSignedIn>
                </Route>
                {workspaceRoutes
                  .filter((path) => path !== '/')
                  .map((path) => (
                    <Route key={path} path={path}>
                      <RequireAuth>
                        <Workspace />
                      </RequireAuth>
                    </Route>
                  ))}
                <Route path="/">
                  <PublicHome />
                </Route>
                <Route>
                  <NotFound />
                </Route>
              </Switch>
            </RoutedErrorBoundary>
            <Toaster />
          </TooltipProvider>
        </PreferencesProvider>
      </AuthProvider>
    </AppQueryProvider>
  );
}

export default App;
