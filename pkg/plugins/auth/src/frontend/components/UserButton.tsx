/**
 * UserButton — Compact user avatar + dropdown for the authenticated user.
 *
 * Shows the user's avatar/initials when signed in, with a dropdown
 * containing their name, email, and sign-out button.
 * Shows a "Sign In" button when not authenticated.
 */

import { useState, useRef, useEffect } from 'react';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';
import { formatAuthRoleLabel } from '../../shared/roles';

export interface UserButtonProps {
  /** Called when the sign-in button is clicked (unauthenticated state) */
  onSignInClick?: () => void;
  /** Additional CSS class names */
  className?: string;
}

export function UserButton({ onSignInClick, className }: UserButtonProps) {
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  if (isLoading) {
    return <div className={`h-8 w-8 animate-pulse rounded-full bg-imp-muted ${className ?? ''}`} />;
  }

  if (!isAuthenticated || !user) {
    return (
      <button
        onClick={onSignInClick}
        className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-imp-foreground hover:bg-imp-muted ${className ?? ''}`}
      >
        <User className="h-4 w-4" />
        Sign In
      </button>
    );
  }

  const initials = (user.name ?? user.email ?? user.id)[0]?.toUpperCase() ?? '?';

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      {/* Avatar trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-imp-primary/10 text-sm font-medium text-imp-primary hover:bg-imp-primary/20 transition-colors"
        title={user.name ?? user.email ?? user.id}
      >
        {user.image ? (
          <img
            src={user.image}
            alt={user.name ?? ''}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          initials
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-lg border border-imp-border bg-imp-background shadow-lg">
          {/* User info */}
          <div className="border-b border-imp-border px-4 py-3">
            <p className="truncate text-sm font-medium">{user.name ?? 'User'}</p>
            {user.email && (
              <p className="truncate text-xs text-imp-muted-foreground">{user.email}</p>
            )}
            {user.role && (
              <span className="mt-1 inline-block rounded-full bg-imp-muted px-2 py-0.5 text-xs font-medium">
                {formatAuthRoleLabel(user.role)}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="p-1">
            <button
              onClick={async () => {
                setIsOpen(false);
                await signOut();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-imp-foreground hover:bg-imp-muted"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
