'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { CheckCircle, Clock } from 'lucide-react';

export default function CourtBookingsPage() {
  const { courts, bookings, users } = useStore();
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);

  const handleCourtSelect = (courtId: string) => {
    setSelectedCourtId(courtId);
  };

  const filteredBookings = (selectedCourtId
    ? bookings.filter(
        (b) =>
          b.courtId === selectedCourtId && (b.status === 'approved' || b.status === 'pending')
      )
    : []
  ).map((booking) => ({
    ...booking,
    userName: users.find((u) => u.id === booking.userId)?.name,
  }));

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
            <Select onValueChange={handleCourtSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a court..." />
              </SelectTrigger>
              <SelectContent>
                {courts.map((court) => (
                  <SelectItem key={court.id} value={court.id}>
                    {court.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCourtId && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.length > 0 ? (
                  filteredBookings.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="font-medium">{booking.userName}</TableCell>
                      <TableCell>{new Date(booking.date).toLocaleDateString()}</TableCell>
                      <TableCell>{booking.time}</TableCell>
                      <TableCell>{getStatusBadge(booking.status)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-24">
                      No bookings found for this court.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
