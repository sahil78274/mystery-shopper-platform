import { Link } from 'wouter';
import { Compass } from 'lucide-react';
import { homeForRole, useAuth } from '@/lib/auth';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="auth-screen">
      <div className="not-found-card">
        <div className="state-icon">
          <Compass size={20} />
        </div>
        <h1>Page not found</h1>
        <p>
          The page you opened does not exist, or your role does not have access to it. Use the sidebar to return to
          your workspace.
        </p>
        <Link className="btn btn-primary" href={homeForRole(user?.role)}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
