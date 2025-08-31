'use client';

import { useStore } from '@/lib/store';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle, XCircle, Calendar, Shield } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

export default function MyBookingsPage() {
  const { bookings, user, courts } = useStore();

  const userBookings = bookings
    .filter((b) => b.userId === user?.id)
    .map((booking) => ({
      ...booking,
      courtName: courts.find((c) => c.id === booking.courtId)?.name,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
  const getStatusBadge = (status: 'pending' | 'approved' | 'rejected') => {
    switch(status) {
        case 'approved':
            return <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400"><CheckCircle className="mr-2 h-4 w-4" />Approved</Badge>;
        case 'rejected':
            return <Badge variant="destructive"><XCircle className="mr-2 h-4 w-4" />Rejected</Badge>;
        case 'pending':
        default:
            return <Badge variant="secondary"><Clock className="mr-2 h-4 w-4" />Pending</Badge>;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">My Bookings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Booking History</CardTitle>
          <CardDescription>
            Here are all your past and upcoming booking requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Court</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {userBookings.length > 0 ? (
                userBookings.map((booking) => (
                  <TableRow key={booking.id}>
                    <TableCell className="font-medium flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        {booking.courtName}
                    </TableCell>
                    <TableCell className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {new Date(booking.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{booking.time}</TableCell>
                    <TableCell>
                      {getStatusBadge(booking.status)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24">
                    You haven't made any bookings yet.
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
