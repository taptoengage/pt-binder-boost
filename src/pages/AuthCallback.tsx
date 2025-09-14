import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// TODO: change these to your real dashboard paths
const ROUTES = {
  client: "/dashboard/client",
  trainer: "/dashboard/trainer",
  admin: "/admin",
  default: "/dashboard",
};

// Example role fetcher. Replace with your real source of truth.
async function getRole(): Promise<"client"|"trainer"|"admin"|"default"> {
  // If you store role in user_roles table:
  // const { data } = await supabase.from("user_roles").select("role").single();
  // return (data?.role as any) ?? "default";

  // If role is in a profile table or JWT custom claims, use that instead.
  return "default";
}

export default function AuthCallback() {
  useEffect(() => {
    (async () => {
      // Ensure supabase parses hash and stores session ON THIS DOMAIN
      await supabase.auth.getSession();

      const role = await getRole();
      const dest = ROUTES[role] || ROUTES.default;

      // Forward user into the app
      window.location.replace(dest);
    })();
  }, []);

  return <div className="p-6 text-white/80">Signing you in…</div>;
}