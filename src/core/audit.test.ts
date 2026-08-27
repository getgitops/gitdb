import { describe, expect, it } from 'vitest';
import { diffEntityRows, filterAuditEvents, formatCommitReason, parseAuditLog, resolveOrganizationId } from './audit.ts';

const RS = '\x1e';
const FS = '\x1f';

function commitLine(hash: string, date: string, author: string, subject: string): string {
  return `${hash}${FS}${date}${FS}${author}${FS}${subject}${RS}`;
}

describe('audit log', () => {
  it('parsea commits de gitdb en eventos con accion y entidad', () => {
    const raw =
      commitLine('abc123', '2026-08-27T13:03:58+00:00', 'gitdb-bot', 'gitdb: insert:organizations, auto-background @ 2026-08-27T13:03:58.639Z') +
      commitLine('def456', '2026-08-27T13:06:39+00:00', 'gitdb-bot', 'gitdb: update:roles, auto-background @ 2026-08-27T13:06:39.411Z');

    const events = parseAuditLog(raw);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ commitHash: 'def456', entity: 'roles', action: 'update', author: 'gitdb-bot' });
    expect(events[1]).toMatchObject({ commitHash: 'abc123', entity: 'organizations', action: 'insert', author: 'gitdb-bot' });
  });

  it('agrupa varias razones en un mismo commit en eventos separados', () => {
    const raw = commitLine(
      'ghi789',
      '2026-08-27T13:10:00+00:00',
      'gitdb-bot',
      'gitdb: insert:organizations, update:roles, auto-background @ 2026-08-27T13:10:00.000Z',
    );

    const events = parseAuditLog(raw);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.entity).sort()).toEqual(['organizations', 'roles']);
  });

  it('ignora commits que no siguen el formato de gitdb', () => {
    const raw = commitLine('zzz000', '2026-08-27T13:00:00+00:00', 'gitdb-bot', 'Initial commit');
    expect(parseAuditLog(raw)).toHaveLength(0);
  });

  it('filtra eventos por rango de fechas', () => {
    const events = parseAuditLog(
      commitLine('d1', '2026-08-25T10:00:00+00:00', 'alice', 'gitdb: insert:organizations, auto-background @ t1') +
        commitLine('d2', '2026-08-26T10:00:00+00:00', 'alice', 'gitdb: update:roles, manual @ t2') +
        commitLine('d3', '2026-08-27T10:00:00+00:00', 'alice', 'gitdb: delete:users, auto-background @ t3'),
    );

    const fromOnly = filterAuditEvents(events, { dateFrom: '2026-08-26' });
    expect(fromOnly.events.map((event) => event.commitHash).sort()).toEqual(['d2', 'd3']);

    const toOnly = filterAuditEvents(events, { dateTo: '2026-08-26' });
    expect(toOnly.events.map((event) => event.commitHash).sort()).toEqual(['d1', 'd2']);

    const range = filterAuditEvents(events, { dateFrom: '2026-08-26', dateTo: '2026-08-26' });
    expect(range.events.map((event) => event.commitHash)).toEqual(['d2']);
  });

  it('filtra eventos por busqueda y pagina resultados', () => {
    const events = parseAuditLog(
      commitLine('a1', '2026-08-27T13:00:00+00:00', 'alice', 'gitdb: insert:organizations, auto-background @ t1') +
        commitLine('a2', '2026-08-27T13:01:00+00:00', 'bob', 'gitdb: update:roles, manual @ t2') +
        commitLine('a3', '2026-08-27T13:02:00+00:00', 'alice', 'gitdb: delete:users, auto-background @ t3'),
    );

    const searched = filterAuditEvents(events, { search: 'roles' });
    expect(searched.total).toBe(1);
    expect(searched.events[0].entity).toBe('roles');

    const byAuthor = filterAuditEvents(events, { search: 'bob' });
    expect(byAuthor.total).toBe(1);
    expect(byAuthor.events[0].entity).toBe('roles');

    const paged = filterAuditEvents(events, { limit: 1, offset: 1 });
    expect(paged.total).toBe(3);
    expect(paged.events).toHaveLength(1);
  });

  it('extrae y filtra por organizationId cuando la razon lo incluye', () => {
    const events = parseAuditLog(
      commitLine('o1', '2026-08-27T13:00:00+00:00', 'alice', 'gitdb: insert:projects@org-1, auto-background @ t1') +
        commitLine('o2', '2026-08-27T13:01:00+00:00', 'alice', 'gitdb: update:projects@org-2, manual @ t2'),
    );

    expect(events[1]).toMatchObject({ entity: 'projects', organizationId: 'org-1' });
    expect(events[0]).toMatchObject({ entity: 'projects', organizationId: 'org-2' });

    const scoped = filterAuditEvents(events, { organizationId: 'org-1' });
    expect(scoped.total).toBe(1);
    expect(scoped.events[0].commitHash).toBe('o1');
  });
});

describe('commit reason helpers', () => {
  it('formatCommitReason agrega el organizationId cuando se resuelve', () => {
    expect(formatCommitReason('insert', 'projects', 'org-1')).toBe('insert:projects@org-1');
    expect(formatCommitReason('insert', 'projects', null)).toBe('insert:projects');
  });

  it('resolveOrganizationId usa el id propio para organizations y organizationId para el resto', () => {
    expect(resolveOrganizationId('organizations', [{ id: 'org-1' }])).toBe('org-1');
    expect(resolveOrganizationId('projects', [{ id: 'p1', organizationId: 'org-1' }])).toBe('org-1');
    expect(
      resolveOrganizationId('projects', [{ organizationId: 'org-1' }, { organizationId: 'org-2' }]),
    ).toBeNull();
    expect(resolveOrganizationId('projects', [{ id: 'p1' }])).toBeNull();
  });
});

describe('diffEntityRows', () => {
  it('detecta filas agregadas, eliminadas y modificadas por id', () => {
    const before = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    const after = [
      { id: '1', name: 'Alice Updated' },
      { id: '3', name: 'Charlie' },
    ];

    const changes = diffEntityRows(before, after);

    expect(changes).toHaveLength(3);
    expect(changes).toContainEqual({
      type: 'modified',
      before: { id: '1', name: 'Alice' },
      after: { id: '1', name: 'Alice Updated' },
      changedFields: ['name'],
    });
    expect(changes).toContainEqual({ type: 'added', row: { id: '3', name: 'Charlie' } });
    expect(changes).toContainEqual({ type: 'removed', row: { id: '2', name: 'Bob' } });
  });

  it('trata todo como agregado cuando no hay estado previo', () => {
    const changes = diffEntityRows(null, [{ id: '1', name: 'Alice' }]);
    expect(changes).toEqual([{ type: 'added', row: { id: '1', name: 'Alice' } }]);
  });
});

