import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { ChevronLeft, ChevronRight, Home, FileText, KeyRound, Sun, Moon } from 'lucide-react';
import { cn } from '~/lib/utils';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '../ui/tooltip';
import { useTheme } from '~/contexts/ThemeProvider';
import { usePluginRegistry } from '~/contexts/PluginRegistryContext';

export interface AppSideMenuProps {
  basePath?: string;
}

export function AppSideMenu({ basePath = '' }: AppSideMenuProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const registry = usePluginRegistry();

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  };

  const menuItems = [
    { icon: Home, label: 'Home', href: basePath || '/' },
    { icon: FileText, label: 'Executions', href: `${basePath}/executions` },
    { icon: KeyRound, label: 'Credentials', href: `${basePath}/credentials` },
  ];

  // Plugin-contributed sidebar items (top position = after defaults)
  const pluginTopItems = registry.sidebarItems
    .filter((item) => item.position !== 'bottom')
    .filter((item) => !item.permission || registry.checkPermission(item.permission))
    .map((item) => ({
      icon: item.icon,
      label: item.label,
      href: `${basePath}${item.path}`,
    }));

  const pluginBottomItems = registry.sidebarItems
    .filter((item) => item.position === 'bottom')
    .filter((item) => !item.permission || registry.checkPermission(item.permission))
    .map((item) => ({
      icon: item.icon,
      label: item.label,
      href: `${basePath}${item.path}`,
    }));

  const allMainItems = [...menuItems, ...pluginTopItems];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        !isCollapsed &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node)
      ) {
        setIsCollapsed(true);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCollapsed]);

  return (
    <div className="relative w-16 shrink-0">
      <div
        ref={sidebarRef}
        className={cn(
          'imp-sidebar-shell absolute left-0 top-0 z-50 flex h-full flex-col border-r border-imp-border bg-imp-sidebar text-imp-sidebar-foreground transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64',
        )}
      >
        <Button
          variant="ghost"
          size="icon"
          className="absolute z-10 w-6 h-6 border rounded-full -right-3 top-4 border-imp-border bg-imp-background"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>

        {/* Sidebar content */}
        <div className="flex items-center px-4 border-b h-14 border-border">
          {isCollapsed ? (
            <button
              onClick={() => setIsCollapsed(false)}
              className="flex items-center justify-center w-8 h-8 transition-opacity rounded cursor-pointer bg-primary text-primary-foreground hover:opacity-90"
            >
              <span className="text-sm font-bold">F</span>
            </button>
          ) : (
            <h2 className="text-lg font-semibold">Invect</h2>
          )}
        </div>

        {/* Menu items */}
        <TooltipProvider>
          <nav className="flex-1 p-2 space-y-1">
            {allMainItems.map((item) => {
              const isHome = item.href === basePath || item.href === '/';
              const isActive = isHome
                ? location.pathname === item.href
                : location.pathname.startsWith(item.href);

              return (
                <Tooltip key={item.label} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link to={item.href} aria-label={item.label}>
                      <Button
                        variant={isActive ? 'secondary' : 'ghost'}
                        className={cn(
                          'w-full',
                          isCollapsed ? 'justify-center px-2' : 'justify-start px-3',
                        )}
                      >
                        <item.icon className={cn('h-5 w-5', !isCollapsed && 'mr-3')} />
                        {!isCollapsed && <span>{item.label}</span>}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right" sideOffset={16}>
                      <p>{item.label}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {/* Plugin bottom sidebar items + Dark Mode Toggle */}
          <div className="p-2 border-t border-border space-y-1">
            {pluginBottomItems.map((item) => {
              const isActive = location.pathname.startsWith(item.href);
              return (
                <Tooltip key={item.label} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link to={item.href} aria-label={item.label}>
                      <Button
                        variant={isActive ? 'secondary' : 'ghost'}
                        className={cn(
                          'w-full',
                          isCollapsed ? 'justify-center px-2' : 'justify-start px-3',
                        )}
                      >
                        <item.icon className={cn('h-5 w-5', !isCollapsed && 'mr-3')} />
                        {!isCollapsed && <span>{item.label}</span>}
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  {isCollapsed && (
                    <TooltipContent side="right" sideOffset={16}>
                      <p>{item.label}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            })}
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={toggleTheme}
                  className={cn(
                    'w-full',
                    isCollapsed ? 'justify-center px-2' : 'justify-start px-3',
                  )}
                >
                  {resolvedTheme === 'dark' ? (
                    <Sun className={cn('h-5 w-5', !isCollapsed && 'mr-3')} />
                  ) : (
                    <Moon className={cn('h-5 w-5', !isCollapsed && 'mr-3')} />
                  )}
                  {!isCollapsed && (
                    <span>{resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                  )}
                </Button>
              </TooltipTrigger>
              {isCollapsed && (
                <TooltipContent side="right" sideOffset={16}>
                  <p>{resolvedTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          {/* Plugin sidebar footer (e.g. user menu) */}
          {registry.SidebarFooter && (
            <div className="p-2 border-t border-border">
              <registry.SidebarFooter collapsed={isCollapsed} basePath={basePath} />
            </div>
          )}
        </TooltipProvider>
      </div>
    </div>
  );
}
