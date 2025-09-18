import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const AuthRedirect = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || params.get("token");

    (async () => {
      try {
        if (code) {
          console.log("[AuthRedirect] Processing auth code/token");
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          
          console.log("[AuthRedirect] Session exchange successful");
          navigate("/dashboard", { replace: true });
          return;
        }
        
        console.log("[AuthRedirect] No auth code/token found");
        navigate("/auth", { replace: true });
      } catch (err: any) {
        console.error("[AuthRedirect] Exchange failed:", err?.message || "Unknown error");
        navigate("/auth", { replace: true });
      }
    })();
  }, [navigate]);

  return null;
};

export default AuthRedirect;