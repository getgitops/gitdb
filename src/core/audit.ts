/** Action encoded in a gitdb commit reason, e.g. `insert:organizations`. */
export type AuditAction = 'insert' | 'update' | 'delete' | 'other';

export type AuditEvent = {
  /** Full git commit hash the event was recorded in. */
  commitHash: string;
  /** ISO-8601 commit timestamp. */
  timestamp: string;
  /** Git commit author name. */
  author: string;
  /** Entity/table affected, null when the commit reason has no `action:entity` shape. */
  entity: string | null;
  action: AuditAction;
  /** Raw reason string this event was parsed from, e.g. `insert:organizations`. */
  reason: string;
  /** Full commit subject line. */
  message: string;
};

export type AuditQueryOptions = {
  /** Case-insensitive match against entity, action, reason, author and message. */
  search?: string;
  entity?: string;
  action?: AuditAction;
  limit?: number;
  offset?: number;
};

export type AuditQueryResult = {
  events: AuditEvent[];
  total: number;
};

const COMMIT_SUBJECT_PATTERN = /^gitdb: (.+) @ (.+)$/;
const ACTION_REASON_PATTERN = /^(insert|update|delete):(.+)$/;
const RECORD_SEPARATOR = '\x1e';
const FIELD_SEPARATOR = '\x1f';

/** Parses raw `git log` output (see {@link formatAuditLogArgs}) into structured audit events. */
export function parseAuditLog(rawLog: string): AuditEvent[] {
  const events: AuditEvent[] = [];

  const commits = rawLog
    .split(RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const commit of commits) {
    const [hash, timestamp, author, subject] = commit.split(FIELD_SEPARATOR);
    if (!hash || !timestamp || !author || !subject) {
      continue;
    }

    const subjectMatch = subject.match(COMMIT_SUBJECT_PATTERN);
    if (!subjectMatch) {
      continue;
    }

    const reasons = subjectMatch[1]
      .split(',')
      .map((reason) => reason.trim())
      .filter(Boolean);

    const actionReasons = reasons.filter((reason) => ACTION_REASON_PATTERN.test(reason));

    if (!actionReasons.length) {
      events.push({
        commitHash: hash,
        timestamp,
        author,
        entity: null,
        action: 'other',
        reason: reasons.join(', '),
        message: subject,
      });
      continue;
    }

    for (const reason of actionReasons) {
      const actionMatch = reason.match(ACTION_REASON_PATTERN)!;
      events.push({
        commitHash: hash,
        timestamp,
        author,
        entity: actionMatch[2],
        action: actionMatch[1] as AuditAction,
        reason,
        message: subject,
      });
    }
  }

  return events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/** git log arguments producing one record per commit, safe to parse with {@link parseAuditLog}. */
export function formatAuditLogArgs(): string[] {
  return [
    'log',
    '--date=iso-strict',
    `--pretty=format:%H${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%s${RECORD_SEPARATOR}`,
  ];
}

export function filterAuditEvents(events: AuditEvent[], options: AuditQueryOptions = {}): AuditQueryResult {
  const { search, entity, action, limit, offset = 0 } = options;

  let filtered = events;

  if (entity) {
    filtered = filtered.filter((event) => event.entity === entity);
  }

  if (action) {
    filtered = filtered.filter((event) => event.action === action);
  }

  const query = search?.trim().toLowerCase();
  if (query) {
    filtered = filtered.filter((event) =>
      [event.message, event.reason, event.entity ?? '', event.action, event.author]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }

  const total = filtered.length;
  const page = limit !== undefined ? filtered.slice(offset, offset + limit) : filtered.slice(offset);

  return { events: page, total };
}

export type EntityRow = Record<string, unknown>;

export type EntityRowChange =
  | { type: 'added'; row: EntityRow }
  | { type: 'removed'; row: EntityRow }
  | { type: 'modified'; before: EntityRow; after: EntityRow; changedFields: string[] };

/** Row-level diff between two revisions of an entity file, matched by `id` when present. */
export function diffEntityRows(before: unknown[] | null, after: unknown[] | null): EntityRowChange[] {
  const beforeRows = Array.isArray(before) ? (before as EntityRow[]) : [];
  const afterRows = Array.isArray(after) ? (after as EntityRow[]) : [];

  const keyOf = (row: EntityRow, index: number): string =>
    row && typeof row === 'object' && 'id' in row ? String(row.id) : `#${index}:${JSON.stringify(row)}`;

  const beforeMap = new Map(beforeRows.map((row, index) => [keyOf(row, index), row]));
  const afterMap = new Map(afterRows.map((row, index) => [keyOf(row, index), row]));

  const changes: EntityRowChange[] = [];

  for (const [key, row] of afterMap) {
    const beforeRow = beforeMap.get(key);
    if (!beforeRow) {
      changes.push({ type: 'added', row });
      continue;
    }

    if (JSON.stringify(beforeRow) !== JSON.stringify(row)) {
      const changedFields = Object.keys({ ...beforeRow, ...row }).filter(
        (field) => JSON.stringify(beforeRow[field]) !== JSON.stringify(row[field]),
      );
      changes.push({ type: 'modified', before: beforeRow, after: row, changedFields });
    }
  }

  for (const [key, row] of beforeMap) {
    if (!afterMap.has(key)) {
      changes.push({ type: 'removed', row });
    }
  }

  return changes;
}
