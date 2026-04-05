'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Customers', href: '/dashboard/customers', icon: '👥' },
  { name: 'Products', href: '/dashboard/products', icon: '📦' },
  { name: 'Orders', href: '/dashboard/orders', icon: '🛒' },
  { name: 'Team', href: '/dashboard/team', icon: '🏢' },
  { name: 'Workflows', href: '/dashboard/workflows', icon: '⚡' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-sidebar-border bg-sidebar-bg">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <span className="text-lg font-bold">🚀 Acme</span>
        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          ADMIN
        </span>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-0.5 p-2">
        {navigation.map((item) => {
          const isActive =
            item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'bg-sidebar-active font-medium text-sidebar-active-text'
                  : 'text-muted hover:bg-accent hover:text-foreground'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          <div className="h-6 w-6 rounded-full bg-primary/20 text-center leading-6 text-[10px] font-bold text-primary">
            SC
          </div>
          <div>
            <div className="font-medium text-foreground">Sarah Chen</div>
            <div>admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
