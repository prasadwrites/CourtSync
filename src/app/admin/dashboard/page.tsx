'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStore } from '@/lib/store';
import { Users, Shield, CalendarClock } from 'lucide-react';

export default function AdminDashboard() {
  const { users, courts, bookings } = useStore();
  const pendingBookings = bookings.filter(b => b.status === 'pending').length;

  const stats = [
    { title: 'Total Users', value: users.length, icon: Users, color: 'text-blue-500' },
    { title: 'Total Courts', value: courts.length, icon: Shield, color: 'text-green-500' },
    { title: 'Pending Bookings', value: pendingBookings, icon: CalendarClock, color: 'text-yellow-500' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {stats.map(stat => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 text-muted-foreground ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <h2 className="text-2xl font-semibold mb-4">Welcome, Administrator!</h2>
        <p className="text-muted-foreground">
          From this dashboard, you can manage all aspects of CourtSync. Use the navigation on the left to manage users, courts, and approve booking requests.
        </p>
      </div>
    </div>
  );
}
