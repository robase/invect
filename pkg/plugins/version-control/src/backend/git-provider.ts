// =============================================================================
// Git Provider Interface — abstraction over GitHub / GitLab / Bitbucket
// =============================================================================

/** Result of fetching a file from the remote */
export interface GitFileContent {
  content: string;
  sha: string;
}

/** Result of creating/updating a file on the remote */
export interface GitCommitResult {
  commitSha: string;
}

/** Branch info */
export interface GitBranchInfo {
  sha: string;
}

/** Pull request / merge request creation options */
export interface CreatePullRequestOptions {
  title: string;
  body: string;
  head: string;
  base: string;
  draft?: boolean;
}

/** Pull request / merge request result */
export interface GitPullRequestResult {
  number: number;
  url: string;
}

/** Pull request / merge request info */
export interface GitPullRequestInfo {
  state: 'open' | 'closed' | 'merged';
  mergedAt?: string;
}

/** File update options */
export interface GitFileUpdateOptions {
  branch: string;
  sha?: string;
}

/**
 * Abstraction over a Git hosting provider (GitHub, GitLab, Bitbucket).
 *
 * All methods operate on a specific repo (owner/name string).
 * The provider handles authentication internally.
 */
export interface GitProvider {
  /** Provider identifier, e.g. 'github', 'gitlab', 'bitbucket' */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;

  // -- File operations --

  /** Get file content at a specific ref (branch/SHA). Returns null if file doesn't exist. */
  getFileContent(repo: string, path: string, ref?: string): Promise<GitFileContent | null>;

  /** Create or update a file. If sha is provided, it's an update (must match current SHA for conflict detection). */
  createOrUpdateFile(
    repo: string,
    path: string,
    content: string,
    message: string,
    opts: GitFileUpdateOptions,
  ): Promise<GitCommitResult>;

  /** Delete a file from the repo. */
  deleteFile(
    repo: string,
    path: string,
    message: string,
    opts: { branch: string; sha: string },
  ): Promise<void>;

  // -- Branch operations --

  /** Create a new branch from a ref (branch name or SHA). */
  createBranch(repo: string, branch: string, fromRef: string): Promise<void>;

  /** Delete a branch. */
  deleteBranch(repo: string, branch: string): Promise<void>;

  /** Get branch info. Returns null if branch doesn't exist. */
  getBranch(repo: string, branch: string): Promise<GitBranchInfo | null>;

  // -- Pull Request / Merge Request operations --

  /** Create a PR/MR. */
  createPullRequest(repo: string, opts: CreatePullRequestOptions): Promise<GitPullRequestResult>;

  /** Update an existing PR/MR title/body. */
  updatePullRequest(
    repo: string,
    number: number,
    opts: { title?: string; body?: string },
  ): Promise<void>;

  /** Get PR/MR status. */
  getPullRequest(repo: string, number: number): Promise<GitPullRequestInfo>;

  /** Close a PR/MR with an optional comment. */
  closePullRequest(repo: string, number: number, comment?: string): Promise<void>;

  // -- Webhook --

  /** Verify a webhook signature. Returns true if valid. */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean;
}
