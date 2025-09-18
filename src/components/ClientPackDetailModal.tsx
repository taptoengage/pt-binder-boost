import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

// Use the correct, centrally-managed types
type SessionPack = Database['public']['Tables']['session_packs']['Row'];
type Session = Database['public']['Tables']['sessions']['Row'];

interface ClientPackDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pack: SessionPack | null;
  onCancelRequest?: (pack: SessionPack) => void;
}

export function ClientPackDetailModal({ isOpen, onOpenChange, pack, onCancelRequest }: ClientPackDetailModalProps) {
  const fetchPackSessions = async () => {
    if (!pack) return [];
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('session_pack_id', pack.id)
      .order('session_date', { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  };

  const { data: sessions, isLoading } = useQuery<Session[]>({
    queryKey: ['packSessions', pack?.id],
    queryFn: fetchPackSessions,
    enabled: !!pack && isOpen,
  });

  // Correct handler to close this modal before opening the next one
  const handleCancelClick = () => {
    if (!pack || !onCancelRequest) return;
    onOpenChange(false); // 1. Close this detail modal
    onCancelRequest(pack); // 2. Call the parent function to open the cancel modal
  };

  if (!pack) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Session Pack Details</DialogTitle>
          <DialogDescription>
            Review the details and session history of this pack.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Status</TableCell>
                <TableCell>
                  <Badge variant={pack.status === 'active' ? 'default' : 'secondary'}>
                    {pack.status}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Sessions Remaining</TableCell>
                <TableCell>{pack.sessions_remaining} / {pack.total_sessions}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Purchase Date</TableCell>
                <TableCell>{pack.purchase_date ? format(new Date(pack.purchase_date), 'PPP') : 'N/A'}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <h4 className="font-semibold mt-4">Session History</h4>
          {isLoading ? (
            <div className="flex justify-center items-center h-24">
              <Loader2 className="animate-spin" />
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="max-h-60 overflow-y-auto">
              <Table>
                <TableBody>
                  {sessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell>{session.session_date ? format(new Date(session.session_date), 'EEEE, PPP') : 'Unscheduled'}</TableCell>
                      <TableCell>
                        <Badge variant={session.status === 'completed' ? 'default' : 'outline'}>
                          {session.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No session history found for this pack.</p>
          )}
        </div>

        <DialogFooter>
          {pack.status === 'active' && onCancelRequest && (
            <Button variant="destructive" onClick={handleCancelClick}>
              Cancel Pack
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Default export if needed, depending on project structure
export default ClientPackDetailModal;