import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { DashboardNavigation } from '@/components/Navigation';

export default function Clients() {
  const navigate = useNavigate();

  const handleAddNewClient = () => {
    navigate('/clients/new');
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNavigation />
      
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-heading-1 mb-2">Clients</h1>
            <p className="text-muted-foreground">Manage your client base and track their progress</p>
          </div>
          
          <Button 
            variant="gradient" 
            onClick={handleAddNewClient}
            className="flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Client</span>
          </Button>
        </div>
        
        <div className="bg-card rounded-lg p-6 border border-border">
          <p className="text-muted-foreground text-center">
            Client management features coming soon. Use the "Add New Client" button to get started.
          </p>
        </div>
      </div>
    </div>
  );
}