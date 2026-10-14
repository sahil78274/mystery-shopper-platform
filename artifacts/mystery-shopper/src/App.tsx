import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Workspace } from '@/components/workspace';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: 1,
    },
  },
});

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={Workspace} />
              <Route path="/stores" component={Workspace} />
              <Route path="/stores/:id" component={Workspace} />
              <Route path="/shoppers" component={Workspace} />
              <Route path="/shoppers/:id" component={Workspace} />
              <Route path="/verification" component={Workspace} />
              <Route path="/tasks" component={Workspace} />
              <Route path="/tasks/:id" component={Workspace} />
              <Route path="/questionnaires" component={Workspace} />
              <Route path="/questionnaires/:id" component={Workspace} />
              <Route path="/reports" component={Workspace} />
              <Route path="/settings" component={Workspace} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
