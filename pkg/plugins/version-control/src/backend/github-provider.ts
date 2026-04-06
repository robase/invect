// =============================================================================
// GitHub Provider — implements GitProvider using the GitHub REST API (Octokit)
// =============================================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  CreatePullRequestOptions,
  GitBranchInfo,
  GitCommitResult,
  GitFileContent,
  GitFileUpdateOptions,
  GitProvider,
  GitPullRequestInfo,
  GitPullRequestResult,
} from './git-provider';
import type { GitProviderAuth } from '../shared/types';

interface GitHubProviderOptions {
  auth: GitProviderAuth;
}

/**
 * Create a GitHub provider instance.
 *
 * Uses the GitHub REST API directly (no Octokit dependency).
 * Supports PAT, GitHub App, and Invect credential-based auth.
 */
export function githubProvider(options: GitHubProviderOptions): GitProvider {
  let resolvedToken: string | null = null;
  let appTokenExpiresAt: number = 0;

  async function getToken(): Promise<string> {
    // PAT — simple static token
    if (options.auth.type === 'token') {
      return options.auth.token;
    }

    // GitHub App — generate JWT → exchange for installation token
    if (options.auth.type === 'app') {
      // Cache: reuse token if not expired (tokens last 1 hour, refresh 5 min early)
      if (resolvedToken && Date.now() < appTokenExpiresAt - 5 * 60 * 1000) {
        return resolvedToken;
      }

      const jwt = await createAppJwt(options.auth.appId, options.auth.privateKey);

      // Find installation ID (if not provided, get it from the App)
      let installationId = options.auth.installationId;
      if (!installationId) {
        const res = await fetch('https://api.github.com/app/installations', {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${jwt}`,
          },
        });
        if (!res.ok) {
          throw new Error(`Failed to list GitHub App installations: ${res.status}`);
        }
        const installations = (await res.json()) as Array<{ id: number }>;
        if (installations.length === 0) {
          throw new Error(
            'GitHub App has no installations. Install the app on a repository first.',
          );
        }
        installationId = installations[0].id;
      }

      // Exchange JWT for installation access token
      const tokenRes = await fetch(
        `https://api.github.com/app/installations/${installationId}/access_tokens`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${jwt}`,
          },
        },
      );
      if (!tokenRes.ok) {
        throw new Error(`Failed to create installation token: ${tokenRes.status}`);
      }

      const tokenData = (await tokenRes.json()) as { token: string; expires_at: string };
      resolvedToken = tokenData.token;
      appTokenExpiresAt = new Date(tokenData.expires_at).getTime();
      return resolvedToken;
    }

    if (options.auth.type === 'credential') {
      throw new Error(
        'GitHub credential-based auth must be resolved during plugin init. ' +
          'Use { type: "token" } or { type: "app" } for direct configuration.',
      );
    }

    throw new Error(`Unsupported auth type: ${(options.auth as { type: string }).type}`);
  }

  /** Create a JWT for GitHub App authentication (RS256, 10-min expiry). */
  async function createAppJwt(appId: string, privateKey: string): Promise<string> {
    const { createSign } = await import('node:crypto');

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = { iss: appId, iat: now - 60, exp: now + 10 * 60 };

    const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const unsigned = `${b64(header)}.${b64(payload)}`;

    const sign = createSign('RSA-SHA256');
    sign.update(unsigned);
    const signature = sign.sign(privateKey, 'base64url');

    return `${unsigned}.${signature}`;
  }

  async function request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; data: T }> {
    const token = await getToken();
    const url = `https://api.github.com${path}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`GitHub API error ${response.status}: ${text}`);
    }

    const data = response.status === 204 ? (undefined as T) : ((await response.json()) as T);
    return { status: response.status, data };
  }

  function parseRepo(repo: string): { owner: string; repo: string } {
    const [owner, name] = repo.split('/');
    if (!owner || !name) {
      throw new Error(`Invalid repo format "${repo}". Expected "owner/repo".`);
    }
    return { owner, repo: name };
  }

  const provider: GitProvider = {
    id: 'github',
    name: 'GitHub',

    async getFileContent(repo: string, path: string, ref?: string): Promise<GitFileContent | null> {
      const { owner, repo: name } = parseRepo(repo);
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      const { status, data } = await request<{
        content: string;
        sha: string;
        encoding: string;
      }>('GET', `/repos/${owner}/${name}/contents/${encodeURIComponent(path)}${query}`);

      if (status === 404) {
        return null;
      }

      const content =
        data.encoding === 'base64'
          ? Buffer.from(data.content, 'base64').toString('utf-8')
          : data.content;

      return { content, sha: data.sha };
    },

    async createOrUpdateFile(
      repo: string,
      path: string,
      content: string,
      message: string,
      opts: GitFileUpdateOptions,
    ): Promise<GitCommitResult> {
      const { owner, repo: name } = parseRepo(repo);
      const body: Record<string, unknown> = {
        message,
        content: Buffer.from(content).toString('base64'),
        branch: opts.branch,
      };
      if (opts.sha) {
        body.sha = opts.sha;
      }

      const { data } = await request<{ commit: { sha: string } }>(
        'PUT',
        `/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`,
        body,
      );

      return { commitSha: data.commit.sha };
    },

    async deleteFile(
      repo: string,
      path: string,
      message: string,
      opts: { branch: string; sha: string },
    ): Promise<void> {
      const { owner, repo: name } = parseRepo(repo);
      await request('DELETE', `/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`, {
        message,
        sha: opts.sha,
        branch: opts.branch,
      });
    },

    async createBranch(repo: string, branch: string, fromRef: string): Promise<void> {
      const { owner, repo: name } = parseRepo(repo);

      // Resolve fromRef to a SHA
      const { data: refData } = await request<{ object: { sha: string } }>(
        'GET',
        `/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(fromRef)}`,
      );

      await request('POST', `/repos/${owner}/${name}/git/refs`, {
        ref: `refs/heads/${branch}`,
        sha: refData.object.sha,
      });
    },

    async deleteBranch(repo: string, branch: string): Promise<void> {
      const { owner, repo: name } = parseRepo(repo);
      await request(
        'DELETE',
        `/repos/${owner}/${name}/git/refs/heads/${encodeURIComponent(branch)}`,
      );
    },

    async getBranch(repo: string, branch: string): Promise<GitBranchInfo | null> {
      const { owner, repo: name } = parseRepo(repo);
      const { status, data } = await request<{ commit: { sha: string } }>(
        'GET',
        `/repos/${owner}/${name}/branches/${encodeURIComponent(branch)}`,
      );
      if (status === 404) {
        return null;
      }
      return { sha: data.commit.sha };
    },

    async createPullRequest(
      repo: string,
      opts: CreatePullRequestOptions,
    ): Promise<GitPullRequestResult> {
      const { owner, repo: name } = parseRepo(repo);
      const { data } = await request<{ number: number; html_url: string }>(
        'POST',
        `/repos/${owner}/${name}/pulls`,
        {
          title: opts.title,
          body: opts.body,
          head: opts.head,
          base: opts.base,
          draft: opts.draft ?? false,
        },
      );
      return { number: data.number, url: data.html_url };
    },

    async updatePullRequest(
      repo: string,
      number: number,
      opts: { title?: string; body?: string },
    ): Promise<void> {
      const { owner, repo: name } = parseRepo(repo);
      await request('PATCH', `/repos/${owner}/${name}/pulls/${number}`, opts);
    },

    async getPullRequest(repo: string, number: number): Promise<GitPullRequestInfo> {
      const { owner, repo: name } = parseRepo(repo);
      const { data } = await request<{
        state: string;
        merged: boolean;
        merged_at: string | null;
      }>('GET', `/repos/${owner}/${name}/pulls/${number}`);

      let state: 'open' | 'closed' | 'merged';
      if (data.merged) {
        state = 'merged';
      } else if (data.state === 'closed') {
        state = 'closed';
      } else {
        state = 'open';
      }

      return { state, mergedAt: data.merged_at ?? undefined };
    },

    async closePullRequest(repo: string, number: number, comment?: string): Promise<void> {
      const { owner, repo: name } = parseRepo(repo);
      if (comment) {
        await request('POST', `/repos/${owner}/${name}/issues/${number}/comments`, {
          body: comment,
        });
      }
      await request('PATCH', `/repos/${owner}/${name}/pulls/${number}`, { state: 'closed' });
    },

    verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
      const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
      if (expected.length !== signature.length) {
        return false;
      }
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    },
  };

  return provider;
}
