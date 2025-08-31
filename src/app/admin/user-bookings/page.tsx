
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
import { CheckCircle, Clock, XCircle, Calendar, User, Shield } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useState } from 'react';

export default function UserBookingsPage() {
  const { user, users, bookings, courts } = useStore();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const companyUsers = users.filter(u => u.companyId === user?.companyId && u.role === 'user');

  const getBookingsForUser = (userId: string | null) => {
     if (!userId) return [];
     return bookings
        .filter(b => b.userId === userId)
        .map((booking) => ({
            ...booking,
            courtName: courts.find((c) => c.id === booking.courtId)?.name,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
      case 'rejected':
            return <Badge variant="destructive"><XCircle className="mr-2 h-4 w-4" />Rejected</Badge>;
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

  const formatTimeRange = (startTime: string) => {
    const [time, ampm] = startTime.split(' ');
    let [hour] = time.split(':').map(Number);
    
    if (ampm === 'PM' && hour < 12) {
      hour += 12;
    }
    if (ampm === 'AM' && hour === 12) {
      hour = 0;
    }

    const endHour = hour + 1;
    
    const formatHour = (h: number) => {
        const displayHour12 = h % 12 === 0 ? 12 : h % 12;
        const displayAmpm = h < 12 || h === 24 ? 'AM' : 'PM';
        return `${displayHour12}:00 ${displayAmpm}`;
    };

    return `${startTime} - ${formatHour(endHour)}`;
  }

  const selectedUserBookings = getBookingsForUser(selectedUserId);
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">User Bookings</h1>
      <Card>
        <CardHeader>
          <CardTitle>View Bookings by User</CardTitle>
          <CardDescription>Select one of your company's users to see all their booking history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="max-w-sm">
                <Select onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                        {companyUsers.map(u => (
                            <SelectItem key={u.id} value={u.id}>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {u.name}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

           {selectedUserId && (
             selectedUserBookings.length > 0 ? (
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
                        {selectedUserBookings.map((booking) => (
                            <TableRow key={booking.id}>
                                <TableCell className="font-medium flex items-center gap-2"><Shield className="h-4 w-4 text-muted-foreground"/>{booking.courtName}</TableCell>
                                <TableCell><div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground"/>{formatDate(booking.date)}</div></TableCell>
                                <TableCell>{formatTimeRange(booking.time)}</TableCell>
                                <TableCell>{getStatusBadge(booking.status)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
                ) : (
                <div className="text-center text-muted-foreground p-8">
                    No bookings found for this user.
                </div>
                )
            )}
        </CardContent>
      </Card>
    </div>
  );
}
