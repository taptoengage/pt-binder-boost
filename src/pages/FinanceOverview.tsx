import { useNavigate } from 'react-router-dom';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function FinanceOverview() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center space-x-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </Button>
        </div>
        
        <h1 className="text-heading-1 mb-4">Finance Overview</h1>
        
        <p className="text-muted-foreground">
          Your financial summary and tools will be displayed here.
        </p>
      </div>
    </div>
  );
}