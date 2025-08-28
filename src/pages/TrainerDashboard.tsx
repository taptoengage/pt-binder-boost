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
        <p className="mt-2">Welcome back, {trainer.business_name || "Trainer"}!</p>
      )}
      {/* ...real trainer UI... */}
    </div>
  );
};

export default TrainerDashboard;