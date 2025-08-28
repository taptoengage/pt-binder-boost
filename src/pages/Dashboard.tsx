import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/spinner'

const Dashboard = () => {
  const { loading } = useAuth()
  return (
    <div className="flex items-center justify-center h-screen">
      {loading ? <Spinner /> : <p className="text-sm text-muted-foreground">Redirecting…</p>}
    </div>
  )
}

export default Dashboard;
