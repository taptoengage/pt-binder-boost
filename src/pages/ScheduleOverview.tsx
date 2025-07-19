import { useNavigate } from 'react-router-dom';
import { DashboardNavigation } from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const ScheduleOverview = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-heading-1 mb-4">Your Schedule Overview</h1>
        
        <Button 
          variant="outline" 
          onClick={() => navigate('/dashboard')}
          className="mb-6 flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Dashboard</span>
        </Button>
        
        <p className="text-muted-foreground">
          Your comprehensive schedule and availability will be displayed here.
        </p>
      </div>
    </div>
  );
};

export default ScheduleOverview;