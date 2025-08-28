import { useAuth } from '@/hooks/useAuth';

const TrainerDashboard = () => {
  const { authStatus, trainer } = useAuth();

  // Do NOT navigate here. AuthGuard owns routing.
  if (authStatus !== "trainer") return null;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Trainer Dashboard</h1>
      {!trainer && <p className="mt-2">Loading your profile…</p>}
      {trainer && (
        <div className="mt-4">
          <p>Welcome back, Trainer!</p>
          {/* Add actual trainer UI here */}
        </div>
      )}
    </div>
  );
};

export default TrainerDashboard;