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

  useEffect(() => {
    (async () => {
      // Ensure the SDK consumes the URL hash and stores session for THIS domain
      await supabase.auth.getSession();
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