'use client';

import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Check, X, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export default function BookingsPage() {
  const { bookings, users, courts, updateBookingStatus } = useStore();
  const { toast } = useToast();

  const pendingBookings = bookings
    .filter((b) => b.status === 'pending')
    .map((booking) => ({
      ...booking,
      userName: users.find((u) => u.id === booking.userId)?.name,
      courtName: courts.find((c) => c.id === booking.courtId)?.name,
    }));
    
  const handleUpdateStatus = (bookingId: string, status: 'approved' | 'rejected') => {
    updateBookingStatus(bookingId, status);
    toast({
        title: `Booking ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `The booking request has been ${status}.`
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Booking Approvals</h1>
      <Card>
        <CardHeader>
          <CardTitle>Pending Requests</CardTitle>
          <CardDescription>
            Review and approve or reject the following court booking requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingBookings.length > 0 ? (
                pendingBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium">{booking.userName}</TableCell>
                    <TableCell>{booking.courtName}</TableCell>
                    <TableCell>{new Date(booking.date).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <Clock className="mr-2 h-4 w-4" />
                        {booking.time}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(booking.id, 'approved')}>
                        <Check className="mr-2 h-4 w-4" /> Approve
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => handleUpdateStatus(booking.id, 'rejected')}>
                        <X className="mr-2 h-4 w-4" /> Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center h-24">
                    No pending requests.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
