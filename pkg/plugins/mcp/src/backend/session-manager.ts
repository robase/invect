/**
 * Session manager for MCP Streamable HTTP transport.
 *
 * Tracks active sessions, their transports, and handles TTL-based cleanup.
 */

interface SessionEntry {
  transport: unknown; // NodeStreamableHTTPServerTransport
  createdAt: number;
}

export class SessionManager {
  private sessions = new Map<string, SessionEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ttlMs: number = 30 * 60 * 1000) {}

  /** Start periodic cleanup of expired sessions */
  startCleanup(intervalMs: number = 60_000): void {
    if (this.cleanupTimer) {
      return;
    }
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), intervalMs);
    // Don't block process exit
    if (
      this.cleanupTimer &&
      typeof this.cleanupTimer === 'object' &&
      'unref' in this.cleanupTimer
    ) {
      this.cleanupTimer.unref();
    }
  }

  /** Stop periodic cleanup */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Track a new session */
  set(sessionId: string, transport: unknown): void {
    this.sessions.set(sessionId, {
      transport,
      createdAt: Date.now(),
    });
  }

  /** Get a session's transport */
  get(sessionId: string): unknown | undefined {
    return this.sessions.get(sessionId)?.transport;
  }

  /** Check if a session exists */
  has(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /** Remove a specific session */
  delete(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /** Remove sessions that exceed the TTL */
  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, entry] of this.sessions) {
      if (now - entry.createdAt > this.ttlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /** Number of active sessions */
  get size(): number {
    return this.sessions.size;
  }

  /** Close all sessions and stop cleanup */
  async closeAll(): Promise<void> {
    this.stopCleanup();
    for (const [_id, entry] of this.sessions) {
      try {
        const transport = entry.transport as { close?: () => Promise<void> | void };
        if (transport.close) {
          await transport.close();
        }
      } catch {
        // Best-effort cleanup
      }
    }
    this.sessions.clear();
  }
}
