import { Sidebar } from './components/Sidebar';

/**
 * Dashboard layout — sidebar + main content area.
 * All /dashboard/* routes are rendered inside this layout.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
