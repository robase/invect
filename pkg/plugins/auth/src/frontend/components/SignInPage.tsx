/**
 * SignInPage — Full-page sign-in component with layout.
 *
 * Renders the SignInForm centered on the page with a logo, title,
 * and grouped fields matching the Invect design system.
 * Sign-up is not offered — new users are created by admins.
 */

import { SignInForm } from './SignInForm';

export interface SignInPageProps {
  /** Called after successful sign-in */
  onSuccess?: () => void;
  /** Called when user clicks "Sign Up" link (optional — hidden if omitted) */
  onNavigateToSignUp?: () => void;
  /** Page title */
  title?: string;
  /** Page subtitle */
  subtitle?: string;
}

export function SignInPage({
  onSuccess,
  onNavigateToSignUp,
  title = 'Welcome back',
  subtitle = 'Sign in to your account to continue',
}: SignInPageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-imp-background p-4 text-imp-foreground">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {/* Header: logo + title + subtitle */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-8 items-center justify-center rounded-md">
            <ImpLogo className="size-6" />
          </div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-imp-muted-foreground">{subtitle}</p>
        </div>

        {/* Form */}
        <SignInForm onSuccess={onSuccess} />

        {/* Separator + admin note */}
        <div className="relative text-center text-sm">
          <div className="absolute inset-0 top-1/2 border-t border-imp-border" />
          <span className="relative bg-imp-background px-2 text-imp-muted-foreground">
            Admin-managed accounts
          </span>
        </div>

        <p className="px-6 text-center text-xs text-imp-muted-foreground">
          New accounts are created by your administrator.
          {onNavigateToSignUp ? ' Or ' : ' Contact your admin if you need access.'}
          {onNavigateToSignUp && (
            <button
              type="button"
              onClick={onNavigateToSignUp}
              className="font-medium underline underline-offset-4 hover:text-imp-foreground"
            >
              Sign up
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Internal: Invect logo (workflow bolt icon)
// ─────────────────────────────────────────────────────────────

function ImpLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
    </svg>
  );
}
