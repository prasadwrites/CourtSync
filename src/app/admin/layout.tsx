'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from '@/components/ui/sidebar';
import { LayoutDashboard, Users, CalendarCheck, Shield, BookCopy } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!user) {
      router.replace('/');
    } else if (user.role !== 'admin') {
      router.replace('/user/dashboard');
    }
  }, [user, router]);
  
  if (!user || user.role !== 'admin') {
    return null; // or a loading spinner
  }

  const menuItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'User Management', icon: Users },
    { href: '/admin/courts', label: 'Court Management', icon: Shield },
    { href: '/admin/bookings', label: 'Booking Approvals', icon: CalendarCheck },
    { href: '/admin/court-bookings', label: 'Court Bookings', icon: BookCopy },
  ];

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader />
        <SidebarContent>
          <SidebarMenu>
            {menuItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  onClick={() => router.push(item.href)}
                  isActive={pathname === item.href}
                  tooltip={item.label}
                >
                  <item.icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="flex flex-col">
          <Header />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
