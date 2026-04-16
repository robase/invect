/**
 * TwoFactorVerifyForm — TOTP / backup code verification form.
 *
 * Shown after sign-in when the user has 2FA enabled.
 * Allows entering a TOTP code from their authenticator app,
 * or switching to backup code entry.
 */

import { useState, type FormEvent } from 'react';
import { Loader2, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';

export interface TwoFactorVerifyFormProps {
  /** Called after successful 2FA verification */
  onSuccess?: () => void;
  /** Called when user wants to go back to sign-in */
  onBack?: () => void;
  /** Additional CSS class names */
  className?: string;
}

export function TwoFactorVerifyForm({ onSuccess, onBack, className }: TwoFactorVerifyFormProps) {
  const { verifyTotp, verifyBackupCode, isVerifyingTwoFactor, error, cancelTwoFactor } = useAuth();
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [trustDevice, setTrustDevice] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setLocalError(mode === 'totp' ? 'Enter your verification code' : 'Enter a backup code');
      return;
    }

    try {
      if (mode === 'totp') {
        await verifyTotp({ code: trimmedCode, trustDevice });
      } else {
        await verifyBackupCode(trimmedCode);
      }
      onSuccess?.();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Verification failed');
    }
  };

  const handleBack = () => {
    cancelTwoFactor();
    onBack?.();
  };

  const displayError = localError ?? error;

  return (
    <div className={className}>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-imp-primary/10">
          <ShieldCheck className="h-6 w-6 text-imp-primary" />
        </div>
        <h2 className="text-lg font-semibold text-imp-foreground">
          {mode === 'totp' ? 'Two-Factor Authentication' : 'Backup Code'}
        </h2>
        <p className="mt-1 text-sm text-imp-muted-foreground">
          {mode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app'
            : 'Enter one of your backup codes'}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-4">
          {/* Code input */}
          <div className="grid gap-2">
            <label htmlFor="auth-2fa-code" className="text-sm font-medium leading-none">
              {mode === 'totp' ? 'Verification Code' : 'Backup Code'}
            </label>
            <input
              id="auth-2fa-code"
              type="text"
              inputMode={mode === 'totp' ? 'numeric' : 'text'}
              pattern={mode === 'totp' ? '[0-9]*' : undefined}
              maxLength={mode === 'totp' ? 6 : 20}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={mode === 'totp' ? '000000' : 'xxxx-xxxx-xx'}
              autoComplete="one-time-code"
              autoFocus
              required
              className="flex h-10 w-full rounded-md border border-imp-border bg-transparent px-3 py-1 text-center text-lg font-mono tracking-widest shadow-sm transition-colors placeholder:text-imp-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-imp-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Trust device checkbox (TOTP mode only) */}
          {mode === 'totp' && (
            <label className="flex items-center gap-2 text-sm text-imp-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={trustDevice}
                onChange={(e) => setTrustDevice(e.target.checked)}
                className="h-4 w-4 rounded border-imp-border"
              />
              Remember this device for 30 days
            </label>
          )}

          {/* Error */}
          {displayError && (
            <div className="rounded-md border border-imp-destructive/30 bg-imp-destructive/10 px-3 py-2 text-sm text-imp-destructive">
              {displayError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isVerifyingTwoFactor}
            className="inline-flex h-9 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-imp-primary px-4 py-2 text-sm font-medium text-imp-primary-foreground shadow transition-colors hover:bg-imp-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-imp-ring disabled:pointer-events-none disabled:opacity-50"
          >
            {isVerifyingTwoFactor ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying…
              </>
            ) : (
              'Verify'
            )}
          </button>

          {/* Toggle mode */}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'totp' ? 'backup' : 'totp');
              setCode('');
              setLocalError(null);
            }}
            className="inline-flex items-center justify-center gap-2 text-sm text-imp-muted-foreground transition-colors hover:text-imp-foreground"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {mode === 'totp' ? 'Use a backup code instead' : 'Use authenticator app instead'}
          </button>

          {/* Back button */}
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-center gap-2 text-sm text-imp-muted-foreground transition-colors hover:text-imp-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </button>
        </div>
      </form>
    </div>
  );
}
