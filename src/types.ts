export type GitDbOptions = {
  repositoryUrl: string;
  autoCommitIntervalMs?: number;
  immediateCommitDelayMs?: number;
  /** Interval in seconds to push pending commits when `syncMode` is `'poll'`. Set to 0 to disable. */
  syncPollSeconds?: number;
  /**
   * Push strategy:
   * - `'poll'` (default): commits accumulate locally and are pushed periodically based on `syncPollSeconds`.
   * - `'immediate'`: every commit (manual, background or auto-interval) is pushed right away.
   * Defaults to `GITDB_SYNC_MODE` from the environment (`'poll'` or `'immediate'`), or `'poll'` when unset.
   */
  syncMode?: 'poll' | 'immediate';
  gitUserName?: string;
  gitUserEmail?: string;
  logger?: import('./infrastructure/logger.ts').GitDbLoggerLike;
  /** Defaults to `<cwd>/.gitdb` when omitted. */
  dataPath?: string;
  /**
   * Personal access token used for HTTPS auth against `repositoryUrl` (clone/push).
   * Defaults to `GITDB_GITHUB_TOKEN` or `GITHUB_TOKEN` from the environment when omitted.
   * Only ever used transiently to build an authenticated URL for git commands; never persisted
   * to the manifest or logged. `repositoryUrl` itself must stay credential-free.
   */
  authToken?: string;
  /** Username paired with `authToken` when embedding HTTPS credentials. Defaults to `'x-access-token'`. */
  authUsername?: string;
};

