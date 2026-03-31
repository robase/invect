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
          <div className="flex items-center justify-center">
            <ImpLogo className="h-10 w-auto" />
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
// Internal: Imperat logo
// ─────────────────────────────────────────────────────────────

function ImpLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 109 209"
      fill="none"
      stroke="currentColor"
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M31.7735 104.5L4.50073 18.7859L54.5007 33.0716L31.7735 104.5Z" />
      <path d="M54.5007 4.5L104.501 18.7857L54.5007 33.0714L4.50073 18.7857L54.5007 4.5Z" />
      <path d="M4.50073 190.214L54.5007 33.0716L104.501 18.7859L4.50073 190.214Z" />
      <path d="M54.5007 204.5L81.4238 104.5L104.501 18.7859L4.50073 190.214L54.5007 204.5Z" />
      <path d="M54.5007 204.5L81.4238 104.5L104.501 190.214L54.5007 204.5Z" />
    </svg>
  );
}
