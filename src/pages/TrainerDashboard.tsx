import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useIsAdmin } from '../hooks/useIsAdmin';
import Spinner from '../components/ui/spinner'; 

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    // Wait until both authentication and admin status checks are complete
    if (authLoading || isAdminLoading) {
      return; // Do nothing while loading
    }

    // Now that we have all the data, we can safely redirect
    if (user) {
      if (isAdmin) {
        navigate('/admin/dashboard');
      } else {
        // This logic correctly defaults non-admins to the client dashboard
        navigate('/client/dashboard');
      }
    } else {
      // If there's no user after loading, redirect to the home page
      navigate('/');
    }
  }, [user, isAdmin, authLoading, isAdminLoading, navigate]);

  // Display a loading spinner while we determine the user's role and destination
  return (
    <div className="flex items-center justify-center h-screen">
      <Spinner />
    </div>
  );
};

export default Dashboard;