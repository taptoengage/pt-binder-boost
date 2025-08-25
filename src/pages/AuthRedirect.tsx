import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

const AuthRedirect = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initiateOAuth = async () => {
      try {
        // Get the current domain for the redirect URL
        const currentOrigin = window.location.origin;
        
        // Trigger Google OAuth with redirect to dashboard
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: `${currentOrigin}/dashboard`
          }
        });

        if (error) {
          console.error('OAuth error:', error);
          toast({
            title: "Authentication Error",
            description: "Failed to initiate login. Please try again.",
            variant: "destructive",
          });
          // Redirect back to landing page on error
          navigate('/');
        }
      } catch (error) {
        console.error('Unexpected error during OAuth:', error);
        toast({
          title: "Authentication Error", 
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive",
        });
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    initiateOAuth();
  }, [navigate, toast]);

  // Show minimal loading state while OAuth is being initiated
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // This component should redirect before reaching this point
  return null;
};

export default AuthRedirect;