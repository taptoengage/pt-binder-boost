import { useAuth } from "@/hooks/useAuth";
import Spinner from "@/components/ui/spinner";

export default function Dashboard() {
  const { loading } = useAuth();

  // Neutral page: AuthGuard handles all redirects.
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  // Should be unreachable because AuthGuard redirects,
  // but keep a friendly fallback for safety.
  return (
    <div className="flex items-center justify-center h-screen">
      <p>Redirecting…</p>
    </div>
  );
}
