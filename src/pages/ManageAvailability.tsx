import React from 'react';
import { DashboardNavigation } from '@/components/Navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function ManageAvailability() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <DashboardNavigation />

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return
          </Button>
          <h1 className="text-heading-1 mb-4">Manage My Availability</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recurring Availability Section */}
          <Card>
            <CardHeader>
              <CardTitle>Recurring Availability</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Define your standard weekly working hours.</p>
              {/* Placeholder for weekly schedule form/display */}
              <div className="mt-4 p-4 border rounded-lg bg-muted/50 text-center text-muted-foreground">
                Recurring Availability Calendar/Form (Coming Soon)
              </div>
            </CardContent>
          </Card>

          {/* One-Off Adjustments Section */}
          <Card>
            <CardHeader>
              <CardTitle>One-Off Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Add or remove availability for specific dates (e.g., holidays, appointments).</p>
              {/* Placeholder for date-specific adjustments */}
              <div className="mt-4 p-4 border rounded-lg bg-muted/50 text-center text-muted-foreground">
                Date-Specific Overrides (Coming Soon)
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}