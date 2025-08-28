import { useAuth } from '@/hooks/useAuth';
import Spinner from '@/components/ui/spinner';

const Dashboard = () => {
  const { authStatus, loading } = useAuth();

  // Let AuthGuard handle all routing - just show loading here
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  // This should never be reached since AuthGuard redirects users
  return (
    <div className="flex items-center justify-center h-screen">
      <p>Redirecting...</p>
    </div>
  );
};

export default Dashboard;