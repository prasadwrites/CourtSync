
'use client';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import {
  useSidebar,
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
} from '@/components/ui/sidebar';
import { LayoutDashboard, Users, CalendarCheck, Shield, BookCopy, Building, UserCog, Sprout, BookUser, Coins, Clapperboard } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

function AdminSidebarMenu() {
  const { user } = useStore();
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();

  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const isSuperAdmin = !user?.companyId;

  const superAdminMenuItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/companies', label: 'Company Management', icon: Building },
    { href: '/admin/manage-users', label: 'Manage Users', icon: UserCog },
    { href: '/admin/manage-courts', label: 'Manage Courts', icon: Sprout },
    { href: '/admin/manage-credits', label: 'Manage Credits', icon: Coins },
    { href: '/admin/marketing-video', label: 'Marketing Video', icon: Clapperboard },
  ];

  const companyAdminMenuItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/users', label: 'User Management', icon: Users },
    { href: '/admin/courts', label: 'Court Management', icon: Shield },
    { href: '/admin/bookings', label: 'Booking Approvals', icon: CalendarCheck },
    { href: '/admin/court-bookings', label: 'Court Bookings', icon: BookCopy },
    { href: '/admin/user-bookings', label: 'User Bookings', icon: BookUser },
    { href: '/admin/manage-credits', label: 'Manage Credits', icon: Coins },
  ];

  const menuItems = isSuperAdmin ? superAdminMenuItems : companyAdminMenuItems;

  return (
    <SidebarMenu>
      {menuItems.map((item) => (
        <SidebarMenuItem key={item.href} onClick={handleLinkClick}>
          <Link href={item.href} passHref>
            <SidebarMenuButton
              asChild
              isActive={pathname === item.href}
              tooltip={item.label}
            >
              <span>
                <item.icon />
                <span>{item.label}</span>
              </span>
            </SidebarMenuButton>
          </Link>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useStore();
  const router = useRouter();

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

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader />
        <SidebarContent>
          <AdminSidebarMenu />
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
