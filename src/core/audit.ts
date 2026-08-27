/** Action encoded in a gitdb commit reason, e.g. `insert:organizations`. */
export type AuditAction = 'insert' | 'update' | 'delete' | 'other';

export type AuditEvent = {
  /** Full git commit hash the event was recorded in. */
  commitHash: string;
  /** ISO-8601 commit timestamp. */
  timestamp: string;
  /** Entity/table affected, null when the commit reason has no `action:entity` shape. */
  entity: string | null;
  action: AuditAction;
  /** Raw reason string this event was parsed from, e.g. `insert:organizations`. */
  reason: string;
  /** What caused the commit (`manual`, `auto-background`, `auto-interval`, `shutdown`, ...), if present. */
  trigger: string | null;
  /** Full commit subject line. */
  message: string;
};

export type AuditQueryOptions = {
  /** Case-insensitive match against entity, action, reason, trigger and message. */
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
    const [hash, timestamp, subject] = commit.split(FIELD_SEPARATOR);
    if (!hash || !timestamp || !subject) {
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
    const triggerReasons = reasons.filter((reason) => !ACTION_REASON_PATTERN.test(reason));
    const trigger = triggerReasons.length ? triggerReasons.join(', ') : null;

    if (!actionReasons.length) {
      events.push({
        commitHash: hash,
        timestamp,
        entity: null,
        action: 'other',
        reason: reasons.join(', '),
        trigger,
        message: subject,
      });
      continue;
    }

    for (const reason of actionReasons) {
      const actionMatch = reason.match(ACTION_REASON_PATTERN)!;
      events.push({
        commitHash: hash,
        timestamp,
        entity: actionMatch[2],
        action: actionMatch[1] as AuditAction,
        reason,
        trigger,
        message: subject,
      });
    }
  }

  return events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

/** git log arguments producing one record per commit, safe to parse with {@link parseAuditLog}. */
export function formatAuditLogArgs(): string[] {
  return ['log', '--date=iso-strict', `--pretty=format:%H${FIELD_SEPARATOR}%ad${FIELD_SEPARATOR}%s${RECORD_SEPARATOR}`];
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
      [event.message, event.reason, event.entity ?? '', event.action, event.trigger ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }

  const total = filtered.length;
  const page = limit !== undefined ? filtered.slice(offset, offset + limit) : filtered.slice(offset);

  return { events: page, total };
}
