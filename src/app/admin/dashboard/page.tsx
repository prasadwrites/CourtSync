
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useStore } from '@/lib/store';
import { Users, Shield, CalendarClock, Building } from 'lucide-react';

export default function AdminDashboard() {
  const { user, users, courts, bookings, companies } = useStore();

  const isSuperAdmin = !user?.companyId;

  // Super Admin Stats
  const totalCompanies = companies.length;
  const totalUsers = users.length;
  
  // Company Admin Stats
  const companyUsers = users.filter(u => u.companyId === user?.companyId).length;
  const companyCourts = courts.filter(c => c.companyId === user?.companyId).length;
  const companyBookings = bookings.filter(b => {
    const court = courts.find(c => c.id === b.courtId);
    return court?.companyId === user?.companyId;
  });
  const pendingBookings = companyBookings.filter(b => b.status === 'pending').length;

  const superAdminStats = [
    { title: 'Total Companies', value: totalCompanies, icon: Building, color: 'text-purple-500' },
    { title: 'Total Users (All Companies)', value: totalUsers, icon: Users, color: 'text-blue-500' },
  ];

  const companyAdminStats = [
    { title: 'Your Users', value: companyUsers, icon: Users, color: 'text-blue-500' },
    { title: 'Your Courts', value: companyCourts, icon: Shield, color: 'text-green-500' },
    { title: 'Pending Bookings', value: pendingBookings, icon: CalendarClock, color: 'text-yellow-500' },
  ];

  const stats = isSuperAdmin ? superAdminStats : companyAdminStats;
  const welcomeMessage = isSuperAdmin 
    ? "From this dashboard, you can manage all companies on the platform." 
    : "From this dashboard, you can manage all aspects of your company's courts and bookings.";

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
        <h2 className="text-2xl font-semibold mb-4">Welcome, {user?.name}!</h2>
        <p className="text-muted-foreground">
          {welcomeMessage}
        </p>
      </div>
    </div>
  );
}
