
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function BookingsPage() {
  const { user, bookings, users, courts, updateBookingStatus } = useStore();
  const { toast } = useToast();

  const companyCourts = courts.filter(c => c.companyId === user?.companyId).map(c => c.id);
  
  const pendingBookings = bookings
    .filter((b) => b.status === 'pending' && companyCourts.includes(b.courtId))
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
  
  const formatTimeRange = (startTime: string) => {
    const [time, ampm] = startTime.split(' ');
    let [hour] = time.split(':').map(Number);
    
    if (ampm === 'PM' && hour !== 12) {
      hour += 12;
    }
    if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }

    const endHour = hour + 1;
    
    const formatHour = (h: number) => {
        const displayHour = h % 12 === 0 ? 12 : h % 12;
        const displayAmpm = h < 12 || h === 24 ? 'AM' : 'PM';
        return `${displayHour}:00 ${displayAmpm}`;
    };

    return `${startTime} - ${formatHour(endHour)}`;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Booking Approvals</h1>
      <Card>
        <CardHeader>
          <CardTitle>Pending Requests</CardTitle>
          <CardDescription>
            Review and approve or reject the following court booking requests for your company.
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
                        {formatTimeRange(booking.time)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                       <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <Check className="mr-2 h-4 w-4" /> Approve
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will approve the booking for {booking.userName} at {booking.courtName}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleUpdateStatus(booking.id, 'approved')}>
                              Approve
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                           <Button variant="destructive" size="sm">
                            <X className="mr-2 h-4 w-4" /> Reject
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                               This will reject the booking for {booking.userName} at {booking.courtName}. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleUpdateStatus(booking.id, 'rejected')}>
                              Reject
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
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
