export type GitDbOptions = {
  repositoryUrl: string;
  autoCommitIntervalMs?: number;
  immediateCommitDelayMs?: number;
  /** Interval in seconds to push pending commits. Set to 0 to disable. */
  syncPollSeconds?: number;
  gitUserName?: string;
  gitUserEmail?: string;
  logger?: import('./infrastructure/logger.ts').GitDbLoggerLike;
};

