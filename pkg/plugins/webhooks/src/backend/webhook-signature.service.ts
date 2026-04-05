/**
 * Webhook Signature Verification Service
 *
 * Validates HMAC signatures from webhook providers (GitHub, Slack, Stripe, Linear, etc.).
 * Moved from @invect/core to the webhooks plugin.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

// ─── Provider Definitions ───────────────────────────────────────────

export interface WebhookProviderSignatureConfig {
  signatureHeader: string;
  algorithm: 'sha256' | 'sha1';
  signaturePrefix: string;
  deliveryIdHeader?: string;
  eventTypeHeader?: string;
}

export const WEBHOOK_PROVIDER_SIGNATURES: Record<string, WebhookProviderSignatureConfig> = {
  github: {
    signatureHeader: 'x-hub-signature-256',
    algorithm: 'sha256',
    signaturePrefix: 'sha256=',
    deliveryIdHeader: 'x-github-delivery',
    eventTypeHeader: 'x-github-event',
  },
  slack: {
    signatureHeader: 'x-slack-signature',
    algorithm: 'sha256',
    signaturePrefix: 'v0=',
    deliveryIdHeader: 'x-slack-request-timestamp',
    eventTypeHeader: undefined,
  },
  stripe: {
    signatureHeader: 'stripe-signature',
    algorithm: 'sha256',
    signaturePrefix: 'v1=',
    deliveryIdHeader: undefined,
    eventTypeHeader: 'stripe-event-type',
  },
  linear: {
    signatureHeader: 'linear-signature',
    algorithm: 'sha256',
    signaturePrefix: '',
    deliveryIdHeader: 'linear-delivery',
    eventTypeHeader: 'linear-event',
  },
};

// ─── Service ────────────────────────────────────────────────────────

type LoggerLike = {
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
};

export class WebhookSignatureService {
  constructor(private readonly logger: LoggerLike) {}

  verify(
    provider: string,
    secret: string,
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): { valid: boolean; error?: string } {
    if (!provider || provider === 'none' || provider === 'generic') {
      return { valid: true };
    }

    const config = WEBHOOK_PROVIDER_SIGNATURES[provider];
    if (!config) {
      this.logger.warn('Unknown webhook provider for signature verification, skipping', {
        provider,
      });
      return { valid: true };
    }

    const headerValue = headers[config.signatureHeader];
    if (!headerValue) {
      return {
        valid: false,
        error: `Missing signature header: ${config.signatureHeader}`,
      };
    }

    try {
      if (provider === 'slack') {
        return this.verifySlack(secret, rawBody, headers);
      }
      if (provider === 'stripe') {
        return this.verifyStripe(secret, rawBody, headerValue);
      }
      return this.verifyHmac(config, secret, rawBody, headerValue);
    } catch (error) {
      this.logger.error('Webhook signature verification error', { provider, error });
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  getDeliveryId(provider: string, headers: Record<string, string>): string | undefined {
    if (!provider || provider === 'none' || provider === 'generic') {
      return undefined;
    }
    const config = WEBHOOK_PROVIDER_SIGNATURES[provider];
    if (!config?.deliveryIdHeader) {
      return undefined;
    }
    return headers[config.deliveryIdHeader] || undefined;
  }

  getEventType(provider: string, headers: Record<string, string>): string | undefined {
    if (!provider || provider === 'none' || provider === 'generic') {
      return undefined;
    }
    const config = WEBHOOK_PROVIDER_SIGNATURES[provider];
    if (!config?.eventTypeHeader) {
      return undefined;
    }
    return headers[config.eventTypeHeader] || undefined;
  }

  /**
   * Verify a custom HMAC signature where the user specifies the header name and secret.
   * Supports hex-encoded SHA-256 signatures, with or without a `sha256=` prefix.
   */
  verifyCustomHmac(
    secret: string,
    headerName: string,
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): { valid: boolean; error?: string } {
    const normalizedHeader = headerName.toLowerCase();
    const headerValue = headers[normalizedHeader];
    if (!headerValue) {
      return { valid: false, error: `Missing signature header: ${headerName}` };
    }

    try {
      const expected = createHmac('sha256', secret)
        .update(typeof rawBody === 'string' ? rawBody : rawBody)
        .digest('hex');

      // Support optional sha256= prefix
      const signature = headerValue.startsWith('sha256=') ? headerValue.slice(7) : headerValue;

      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(signature, 'utf8');

      if (a.length !== b.length) {
        return { valid: false, error: 'Signature length mismatch' };
      }

      return timingSafeEqual(a, b)
        ? { valid: true }
        : { valid: false, error: 'HMAC signature mismatch' };
    } catch (error) {
      this.logger.error('Custom HMAC verification error', { headerName, error });
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  private verifyHmac(
    config: WebhookProviderSignatureConfig,
    secret: string,
    rawBody: string | Buffer,
    headerValue: string,
  ): { valid: boolean; error?: string } {
    const expected = createHmac(config.algorithm, secret)
      .update(typeof rawBody === 'string' ? rawBody : rawBody)
      .digest('hex');

    const expectedWithPrefix = `${config.signaturePrefix}${expected}`;
    const a = Buffer.from(expectedWithPrefix, 'utf8');
    const b = Buffer.from(headerValue, 'utf8');

    if (a.length !== b.length) {
      return { valid: false, error: 'Signature length mismatch' };
    }

    return timingSafeEqual(a, b) ? { valid: true } : { valid: false, error: 'Signature mismatch' };
  }

  private verifySlack(
    secret: string,
    rawBody: string | Buffer,
    headers: Record<string, string>,
  ): { valid: boolean; error?: string } {
    const timestamp = headers['x-slack-request-timestamp'];
    if (!timestamp) {
      return { valid: false, error: 'Missing x-slack-request-timestamp header' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
      return { valid: false, error: 'Request timestamp too old (possible replay)' };
    }

    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const sigBasestring = `v0:${timestamp}:${bodyStr}`;
    const expected = createHmac('sha256', secret).update(sigBasestring).digest('hex');
    const expectedFull = `v0=${expected}`;

    const signature = headers['x-slack-signature'] || '';
    const a = Buffer.from(expectedFull, 'utf8');
    const b = Buffer.from(signature, 'utf8');

    if (a.length !== b.length) {
      return { valid: false, error: 'Signature length mismatch' };
    }

    return timingSafeEqual(a, b)
      ? { valid: true }
      : { valid: false, error: 'Slack signature mismatch' };
  }

  private verifyStripe(
    secret: string,
    rawBody: string | Buffer,
    headerValue: string,
  ): { valid: boolean; error?: string } {
    const parts = headerValue.split(',');
    const tsEntry = parts.find((p) => p.startsWith('t='));
    const sigEntries = parts.filter((p) => p.startsWith('v1='));

    if (!tsEntry || sigEntries.length === 0) {
      return { valid: false, error: 'Malformed stripe-signature header' };
    }

    const timestamp = tsEntry.slice(2);
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const signedPayload = `${timestamp}.${bodyStr}`;
    const expected = createHmac('sha256', secret).update(signedPayload).digest('hex');

    for (const entry of sigEntries) {
      const sig = entry.slice(3);
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(sig, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        return { valid: true };
      }
    }

    return { valid: false, error: 'Stripe signature mismatch' };
  }
}
