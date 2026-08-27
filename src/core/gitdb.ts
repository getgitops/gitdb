import path from 'node:path';
import { GitRepository } from '../infrastructure/git-repository.ts';
import { GitDbLogger } from '../infrastructure/logger.ts';
import { FileManager } from '../infrastructure/file-manager.ts';
import type { EntityDefinition } from './schema.ts';
import { getGlobalRelations, type RelationsRegistry } from './relations.ts';
import type { GitDbOptions } from '../types.ts';
import {
  diffEntityRows,
  type AuditActor,
  type AuditQueryOptions,
  type AuditQueryResult,
  type EntityRowChange,
} from './audit.ts';
import { DeleteQuery } from '../queries/delete-query.ts';
import { InsertQuery } from '../queries/insert-query.ts';
import { SelectQuery, type IncludeRelationsInput, type SelectFieldsInput } from '../queries/select-query.ts';
import { UpdateQuery } from '../queries/update-query.ts';
import { toPredicates, type EntityRow, type WhereInput } from '../queries/where-operators.ts';

type SelectWithContext = {
  relationsRegistry?: RelationsRegistry;
  includeRelations?: IncludeRelationsInput;
};

type AggregateWhereInput = WhereInput | WhereInput[];

export class GitDB {
  private readonly repository: GitRepository;
  private readonly fileManager: FileManager;
  private readonly selectWithContext?: SelectWithContext;
  private readonly readyPromise: Promise<void>;
  private readonly actor?: AuditActor;

  constructor(
    repository: GitRepository,
    fileManager: FileManager,
    selectWithContext?: SelectWithContext,
    readyPromise?: Promise<void>,
    actor?: AuditActor,
  ) {
    this.repository = repository;
    this.fileManager = fileManager;
    this.selectWithContext = selectWithContext;
    this.readyPromise = readyPromise ?? Promise.resolve();
    this.actor = actor;
  }

  /** Scopes writes so their commits are attributed to `actor` instead of the configured git user. */
  as(actor: AuditActor): GitDB {
    return new GitDB(this.repository, this.fileManager, this.selectWithContext, this.readyPromise, actor);
  }

  /** Resolves once the local clone/manifest setup has finished; rejects if it failed. */
  ready(): Promise<void> {
    return this.readyPromise;
  }

  async close(): Promise<void> {
    await this.repository.shutdown();
  }

  /** Pushes the pending commits right now. */
  async sync(): Promise<void> {
    await this.repository.sync('manual');
  }

  /** Number of local commits not pushed to the remote branch. */
  getPendingCommits(): Promise<number> {
    return this.repository.getPendingCommits();
  }

  /** True when there is nothing pending to commit nor to push. */
  isSynced(): Promise<boolean> {
    return this.repository.isSynced();
  }

  /** Reads the commit history as audit events, with optional search/pagination. */
  auditLog(options?: AuditQueryOptions): Promise<AuditQueryResult> {
    return this.repository.getAuditEvents(options);
  }

  /** Row-level diff of an entity's changes introduced by a given commit. */
  async entityDiff(commitHash: string, entity: string): Promise<EntityRowChange[]> {
    const { before, after } = await this.repository.getEntityDiff(commitHash, entity);
    return diffEntityRows(before, after);
  }

  private static createGlobalRegistry(): RelationsRegistry {
    return {
      for() {
        return {};
      },
      get(source) {
        return getGlobalRelations(source);
      },
      resolve(source, relationName) {
        return getGlobalRelations(source)[relationName];
      },
      all() {
        return {};
      },
    };
  }

  with(relationsRegistry: RelationsRegistry, includeRelations?: IncludeRelationsInput): GitDB;
  with(includeRelations?: IncludeRelationsInput): GitDB;
  with(
    relationsOrInclude?: RelationsRegistry | IncludeRelationsInput,
    includeRelationsMaybe?: IncludeRelationsInput,
  ): GitDB {
    const isRegistry =
      typeof relationsOrInclude === 'object' &&
      relationsOrInclude !== null &&
      'for' in relationsOrInclude &&
      'get' in relationsOrInclude &&
      'resolve' in relationsOrInclude;

    const relationsRegistry = isRegistry
      ? (relationsOrInclude as RelationsRegistry)
      : GitDB.createGlobalRegistry();

    const includeRelations = isRegistry
      ? includeRelationsMaybe
      : (relationsOrInclude as IncludeRelationsInput | undefined);

    return new GitDB(
      this.repository,
      this.fileManager,
      {
        relationsRegistry,
        includeRelations: includeRelations ?? null,
      },
      this.readyPromise,
      this.actor,
    );
  }

  select(fields?: SelectFieldsInput): SelectQuery {
    return new SelectQuery((entityName) => this.fileManager.readEntityRows(entityName), {
      relationsRegistry: this.selectWithContext?.relationsRegistry,
      includeRelations: this.selectWithContext?.includeRelations,
      selectFields: fields,
    });
  }

  async $count(entity: EntityDefinition, where?: AggregateWhereInput): Promise<number> {
    const rows = await this.loadRowsForAggregate(entity, where);
    return rows.length;
  }

  async $sum(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    return numbers.reduce((total, value) => total + value, 0);
  }

  async $avg(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number | null> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    if (!numbers.length) {
      return null;
    }

    const total = numbers.reduce((accumulator, value) => accumulator + value, 0);
    return total / numbers.length;
  }

  async $max(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number | null> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    if (!numbers.length) {
      return null;
    }

    return numbers.reduce((max, value) => (value > max ? value : max));
  }

  async $min(entity: EntityDefinition, field: string, where?: AggregateWhereInput): Promise<number | null> {
    const numbers = await this.loadNumbersForAggregate(entity, field, where);
    if (!numbers.length) {
      return null;
    }

    return numbers.reduce((min, value) => (value < min ? value : min));
  }

  insert(entity: EntityDefinition): InsertQuery {
    return new InsertQuery(entity, {
      loadEntityRows: (entityName) => this.fileManager.readEntityRows(entityName),
      saveEntityRows: (entityName, rows) => this.fileManager.writeEntityRows(entityName, rows),
      queueCommit: (reason) => this.repository.queueBackgroundCommit(reason, this.actor),
    });
  }

  update(entity: EntityDefinition): UpdateQuery {
    return new UpdateQuery(entity, {
      loadEntityRows: (entityName) => this.fileManager.readEntityRows(entityName),
      saveEntityRows: (entityName, rows) => this.fileManager.writeEntityRows(entityName, rows),
      queueCommit: (reason) => this.repository.queueBackgroundCommit(reason, this.actor),
    });
  }

  delete(entity: EntityDefinition): DeleteQuery {
    return new DeleteQuery(entity, {
      loadEntityRows: (entityName) => this.fileManager.readEntityRows(entityName),
      saveEntityRows: (entityName, rows) => this.fileManager.writeEntityRows(entityName, rows),
      queueCommit: (reason) => this.repository.queueBackgroundCommit(reason, this.actor),
    });
  }

  private async loadRowsForAggregate(entity: EntityDefinition, where?: AggregateWhereInput): Promise<EntityRow[]> {
    const rows = await this.fileManager.readEntityRows<EntityRow>(entity.name);
    if (!where) {
      return rows;
    }

    const whereList = Array.isArray(where) ? where : [where];
    if (!whereList.length) {
      return rows;
    }

    const predicates = toPredicates(whereList);
    return rows.filter((row) => predicates.every((predicate) => predicate.test(row)));
  }

  private async loadNumbersForAggregate(
    entity: EntityDefinition,
    field: string,
    where?: AggregateWhereInput,
  ): Promise<number[]> {
    const rows = await this.loadRowsForAggregate(entity, where);
    const numbers = rows
      .map((row) => row[field])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

    return numbers;
  }
}

export const DEFAULT_DATA_PATH = path.join(process.cwd(), '.gitdb');

export function gitDb(repositoryUrl: string, options: Partial<Omit<GitDbOptions, 'repositoryUrl'>> = {}): GitDB {
  const logger = new GitDbLogger(options.logger);
  const dataPath = options.dataPath ?? DEFAULT_DATA_PATH;

  const repository = new GitRepository({
    dataPath,
    repositoryUrl,
    autoCommitIntervalMs: options.autoCommitIntervalMs ?? 60_000,
    immediateCommitDelayMs: options.immediateCommitDelayMs ?? 800,
    syncPollSeconds: options.syncPollSeconds ?? 60,
    gitUserName: options.gitUserName ?? 'gitdb-bot',
    gitUserEmail: options.gitUserEmail ?? 'gitdb-bot@local',
    logger: options.logger ?? logger,
  });

  const fileManager = new FileManager(dataPath);

  // initialize() must never become an unhandled rejection; real callers observe failures via GitDB.ready()
  const readyPromise = repository.initialize();
  readyPromise.catch(() => {});

  return new GitDB(repository, fileManager, undefined, readyPromise);
}
