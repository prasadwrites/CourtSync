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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Check, CheckCircle, Clock, X, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

export default function CourtBookingsPage() {
  const { courts, bookings, users, updateBookingStatus } = useStore();
  const { toast } = useToast();
  const [selectedCourt, setSelectedCourt] = useState<string | null>(null);

  const handleUpdateStatus = (bookingId: string, status: 'approved' | 'rejected') => {
    updateBookingStatus(bookingId, status);
    const successMessage = status === 'approved' ? 'approved' : 'rejected';
    toast({
        title: `Booking ${successMessage.charAt(0).toUpperCase() + successMessage.slice(1)}`,
        description: `The booking request has been successfully ${successMessage}.`
    });
  }
  
  const getBookingsForCourt = (courtId: string | null) => {
     if (!courtId) return [];
     return bookings
        .filter(
            (b) =>
            b.courtId === courtId && (b.status === 'approved' || b.status === 'pending')
        )
        .map((booking) => ({
            ...booking,
            userName: users.find((u) => u.id === booking.userId)?.name,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  const getStatusBadge = (status: 'pending' | 'approved' | 'rejected') => {
    switch (status) {
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircle className="mr-2 h-4 w-4" />
            Approved
          </Badge>
        );
      case 'pending':
      default:
        return (
          <Badge variant="secondary">
            <Clock className="mr-2 h-4 w-4" />
            Pending
          </Badge>
        );
    }
  };

  const renderActions = (booking: ReturnType<typeof getBookingsForCourt>[0]) => {
    if (booking.status === 'pending') {
      return (
         <div className="space-x-2">
            <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(booking.id, 'approved')}>
                <Check className="mr-2 h-4 w-4" /> Approve
            </Button>
            <Button variant="destructive" size="sm" onClick={() => handleUpdateStatus(booking.id, 'rejected')}>
                <X className="mr-2 h-4 w-4" /> Reject
            </Button>
        </div>
      )
    }
    if (booking.status === 'approved') {
        return (
            <Button variant="destructive" size="sm" onClick={() => handleUpdateStatus(booking.id, 'rejected')}>
                <X className="mr-2 h-4 w-4" /> Cancel Booking
            </Button>
        )
    }
    return null;
  }
  
  const courtBookings = getBookingsForCourt(selectedCourt);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Court Bookings</h1>
      <Card>
        <CardHeader>
          <CardTitle>View Bookings by Court</CardTitle>
          <CardDescription>Select a court to see all its pending and approved bookings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="max-w-sm">
                <Select onValueChange={setSelectedCourt}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a court" />
                    </SelectTrigger>
                    <SelectContent>
                        {courts.map(court => (
                            <SelectItem key={court.id} value={court.id}>{court.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

           {selectedCourt && (
             courtBookings.length > 0 ? (
                <Table>
                    <TableHeader>
                        <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {courtBookings.map((booking) => (
                            <TableRow key={booking.id}>
                                <TableCell className="font-medium flex items-center gap-2"><User className="h-4 w-4" />{booking.userName}</TableCell>
                                <TableCell className="flex items-center gap-2"><Calendar className="h-4 w-4"/>{new Date(booking.date).toLocaleDateString()} at {booking.time}</TableCell>
                                <TableCell>{getStatusBadge(booking.status)}</TableCell>
                                <TableCell className="text-right">{renderActions(booking)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                ) : (
                <div className="text-center text-muted-foreground p-8">
                    No active bookings for this court.
                </div>
                )
            )}
        </CardContent>
      </Card>
    </div>
  );
}
