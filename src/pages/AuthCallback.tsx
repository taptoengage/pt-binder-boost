import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Adjust these to the real routes already used by AuthGuard / router:
const DEST = {
  admin: "/admin/dashboard",
  trainer: "/trainer/dashboard",
  client: "/client/dashboard",
  unassigned_role: "/onboarding",
  unauthenticated: "/",
};

export default function AuthCallback() {
  const { loading, authStatus } = useAuth();

  // Helper to merge params from search and hash
  const getAllURLParams = () => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash);

    const get = (k: string) => search.get(k) ?? hash.get(k);
    return {
      code: get('code'),
      token: get('token'),
    };
  };

  useEffect(() => {
    (async () => {
      try {
        const params = getAllURLParams();
        const codeOrToken = params.code || params.token;
        
        if (codeOrToken) {
          console.log('AuthCallback: processing code/token');
          const { error } = await supabase.auth.exchangeCodeForSession(codeOrToken);
          if (error) {
            console.error('AuthCallback: exchange failed:', error);
            window.location.replace('/auth');
            return;
          }
        }
        
        // Ensure the SDK consumes the URL hash and stores session for THIS domain
        await supabase.auth.getSession();
      } catch (error) {
        console.error('AuthCallback: error:', error);
        window.location.replace('/auth');
      }
    })();
  }, []);

  useEffect(() => {
    // When our hook has a decision, route accordingly
    if (!loading) {
      const target = DEST[authStatus as keyof typeof DEST] ?? DEST.unauthenticated;
      window.location.replace(target);
    }
  }, [loading, authStatus]);

  return (
    <div className="p-6 text-white/80">
      Signing you in…
    </div>
  );
}