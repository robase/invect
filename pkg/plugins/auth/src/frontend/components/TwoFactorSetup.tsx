/**
 * TwoFactorSetup — Component for enabling/disabling 2FA on the profile page.
 *
 * When enabling: prompts for password, shows QR code (TOTP URI), asks for
 * verification code, then displays backup codes.
 *
 * When disabling: prompts for password confirmation.
 */

import { useState, type FormEvent } from 'react';
import { Loader2, ShieldCheck, ShieldOff, Copy, Check, AlertTriangle } from 'lucide-react';
import { useAuth } from '../providers/AuthProvider';

export interface TwoFactorSetupProps {
  /** Additional CSS class names */
  className?: string;
}

type SetupStep = 'idle' | 'password' | 'qr' | 'verify' | 'backup-codes' | 'disable-confirm';

export function TwoFactorSetup({ className }: TwoFactorSetupProps) {
  const { user, enableTwoFactor, disableTwoFactor, verifyTotp } = useAuth();
  const [step, setStep] = useState<SetupStep>('idle');
  const [password, setPassword] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [verifyCode, setVerifyCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const is2FAEnabled = user?.twoFactorEnabled ?? false;

  const handleEnableStart = () => {
    setStep('password');
    setPassword('');
    setError(null);
  };

  const handleDisableStart = () => {
    setStep('disable-confirm');
    setPassword('');
    setError(null);
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      const result = await enableTwoFactor({ password });
      setTotpUri(result.totpURI);
      setBackupCodes(result.backupCodes);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = verifyCode.trim();
    if (!trimmed) {
      setError('Enter the verification code');
      return;
    }

    setLoading(true);
    try {
      await verifyTotp({ code: trimmed });
      setStep('backup-codes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableConfirm = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setLoading(true);
    try {
      await disableTwoFactor({ password });
      setStep('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may not be available
    }
  };

  const handleDone = () => {
    setStep('idle');
    setPassword('');
    setTotpUri('');
    setBackupCodes([]);
    setVerifyCode('');
    setError(null);
  };

  if (step === 'idle') {
    return (
      <div className={className}>
        <div className="rounded-lg border border-imp-border bg-imp-background p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-imp-foreground">
              <ShieldCheck className="h-4 w-4 text-imp-muted-foreground" />
              Two-Factor Authentication
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                is2FAEnabled
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-imp-muted text-imp-muted-foreground'
              }`}
            >
              {is2FAEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="mb-3 text-sm text-imp-muted-foreground">
            {is2FAEnabled
              ? 'Your account is protected with two-factor authentication.'
              : 'Add an extra layer of security to your account by enabling 2FA.'}
          </p>
          {is2FAEnabled ? (
            <button
              onClick={handleDisableStart}
              className="inline-flex items-center gap-2 rounded-md border border-imp-destructive/30 px-3 py-1.5 text-sm font-medium text-imp-destructive transition-colors hover:bg-imp-destructive/10"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Disable 2FA
            </button>
          ) : (
            <button
              onClick={handleEnableStart}
              className="inline-flex items-center gap-2 rounded-md bg-imp-primary px-3 py-1.5 text-sm font-medium text-imp-primary-foreground shadow-sm transition-colors hover:bg-imp-primary/90"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Enable 2FA
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'password') {
    return (
      <div className={className}>
        <div className="rounded-lg border border-imp-border bg-imp-background p-4">
          <h3 className="mb-2 text-sm font-medium text-imp-foreground">
            Enable Two-Factor Authentication
          </h3>
          <p className="mb-4 text-sm text-imp-muted-foreground">Enter your password to continue.</p>
          <form onSubmit={handlePasswordSubmit}>
            <div className="flex flex-col gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                autoFocus
                required
                className="flex h-9 w-full rounded-md border border-imp-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-imp-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-imp-ring"
              />
              {error && (
                <div className="rounded-md border border-imp-destructive/30 bg-imp-destructive/10 px-3 py-2 text-sm text-imp-destructive">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex-1 rounded-md border border-imp-border px-3 py-1.5 text-sm font-medium text-imp-foreground transition-colors hover:bg-imp-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-imp-primary px-3 py-1.5 text-sm font-medium text-imp-primary-foreground shadow-sm transition-colors hover:bg-imp-primary/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'qr') {
    return (
      <div className={className}>
        <div className="rounded-lg border border-imp-border bg-imp-background p-4">
          <h3 className="mb-2 text-sm font-medium text-imp-foreground">Scan QR Code</h3>
          <p className="mb-4 text-sm text-imp-muted-foreground">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then
            enter the verification code below.
          </p>
          {/* TOTP URI for manual entry */}
          <div className="mb-4 rounded-md border border-imp-border bg-imp-muted/50 p-3">
            <p className="mb-1 text-xs font-medium text-imp-muted-foreground">
              Or enter this key manually:
            </p>
            <code className="block break-all text-xs text-imp-foreground">{totpUri}</code>
          </div>
          <form onSubmit={handleVerifySubmit}>
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <label htmlFor="setup-2fa-verify" className="text-sm font-medium">
                  Verification Code
                </label>
                <input
                  id="setup-2fa-verify"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value)}
                  placeholder="000000"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  className="flex h-9 w-full rounded-md border border-imp-border bg-transparent px-3 py-1 text-center text-lg font-mono tracking-widest shadow-sm placeholder:text-imp-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-imp-ring"
                />
              </div>
              {error && (
                <div className="rounded-md border border-imp-destructive/30 bg-imp-destructive/10 px-3 py-2 text-sm text-imp-destructive">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex-1 rounded-md border border-imp-border px-3 py-1.5 text-sm font-medium text-imp-foreground transition-colors hover:bg-imp-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-imp-primary px-3 py-1.5 text-sm font-medium text-imp-primary-foreground shadow-sm transition-colors hover:bg-imp-primary/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify & Enable'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'backup-codes') {
    return (
      <div className={className}>
        <div className="rounded-lg border border-imp-border bg-imp-background p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-medium text-imp-foreground">Save Your Backup Codes</h3>
          </div>
          <p className="mb-4 text-sm text-imp-muted-foreground">
            Store these backup codes in a safe place. Each code can only be used once to sign in if
            you lose access to your authenticator app.
          </p>
          <div className="mb-4 rounded-md border border-imp-border bg-imp-muted/50 p-3">
            <div className="grid grid-cols-2 gap-1.5">
              {backupCodes.map((code, i) => (
                <code key={i} className="text-sm font-mono text-imp-foreground">
                  {code}
                </code>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyBackupCodes}
              className="inline-flex items-center gap-2 rounded-md border border-imp-border px-3 py-1.5 text-sm font-medium text-imp-foreground transition-colors hover:bg-imp-muted"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied!' : 'Copy Codes'}
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="flex-1 inline-flex items-center justify-center rounded-md bg-imp-primary px-3 py-1.5 text-sm font-medium text-imp-primary-foreground shadow-sm transition-colors hover:bg-imp-primary/90"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'disable-confirm') {
    return (
      <div className={className}>
        <div className="rounded-lg border border-imp-destructive/30 bg-imp-background p-4">
          <h3 className="mb-2 text-sm font-medium text-imp-foreground">
            Disable Two-Factor Authentication
          </h3>
          <p className="mb-4 text-sm text-imp-muted-foreground">
            Enter your password to disable 2FA. Your account will be less secure.
          </p>
          <form onSubmit={handleDisableConfirm}>
            <div className="flex flex-col gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                autoFocus
                required
                className="flex h-9 w-full rounded-md border border-imp-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-imp-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-imp-ring"
              />
              {error && (
                <div className="rounded-md border border-imp-destructive/30 bg-imp-destructive/10 px-3 py-2 text-sm text-imp-destructive">
                  {error}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex-1 rounded-md border border-imp-border px-3 py-1.5 text-sm font-medium text-imp-foreground transition-colors hover:bg-imp-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-imp-destructive px-3 py-1.5 text-sm font-medium text-imp-destructive-foreground shadow-sm transition-colors hover:bg-imp-destructive/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Disable 2FA'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return null;
}
