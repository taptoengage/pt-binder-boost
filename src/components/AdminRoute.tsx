import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

interface AdminRouteProps {
  children: ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { data: isAdmin, isLoading: adminLoading, error } = useIsAdmin();
  const { toast } = useToast();

  useEffect(() => {
    // Show toast and log when admin check fails
    if (!authLoading && !adminLoading && user && isAdmin === false) {
      // Log the denied access attempt
      console.warn('Admin access denied:', {
        userId: user.id,
        userEmail: user.email,
        timestamp: new Date().toISOString(),
        attemptedRoute: '/admin/dashboard'
      });
      
      // Show consistent access denied toast
      toast({
        title: "Access Denied",
        description: "Admins only",
        variant: "destructive",
      });
    }
  }, [isAdmin, authLoading, adminLoading, user, toast]);

  // Show loading state while checking authentication and admin status
  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-body text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  // Redirect to home if not authenticated
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Redirect to home if not admin (toast already shown via useEffect)
  if (isAdmin === false) {
    return <Navigate to="/" replace />;
  }

  // Show error state if admin check failed
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <h2 className="text-heading-3 mb-4">Access Check Failed</h2>
          <p className="text-body text-muted-foreground">
            Unable to verify admin access. Please try again.
          </p>
        </div>
      </div>
    );
  }

  // Render admin content if user is admin
  return <>{children}</>;
}