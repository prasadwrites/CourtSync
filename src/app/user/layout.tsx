
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
import { LayoutDashboard, BookCopy, CreditCard } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

function UserSidebarMenu() {
  const pathname = usePathname();
  const { setOpenMobile, isMobile } = useSidebar();
  
  const handleLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const menuItems = [
    { href: '/user/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/user/bookings', label: 'My Bookings', icon: BookCopy },
    { href: '/user/buy-credits', label: 'Buy Credits', icon: CreditCard },
  ];

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

export default function UserLayout({ children }: { children: ReactNode }) {
  const { user } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace('/');
    } else if (user.role !== 'user') {
      router.replace('/admin/dashboard');
    }
  }, [user, router]);

  if (!user || user.role !== 'user') {
    return null; // or a loading spinner
  }

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader />
        <SidebarContent>
          <UserSidebarMenu />
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
