import { describe, expect, it } from 'vitest';
import { filterAuditEvents, parseAuditLog } from './audit.ts';

const RS = '\x1e';
const FS = '\x1f';

function commitLine(hash: string, date: string, subject: string): string {
  return `${hash}${FS}${date}${FS}${subject}${RS}`;
}

describe('audit log', () => {
  it('parsea commits de gitdb en eventos con accion y entidad', () => {
    const raw =
      commitLine('abc123', '2026-08-27T13:03:58+00:00', 'gitdb: insert:organizations, auto-background @ 2026-08-27T13:03:58.639Z') +
      commitLine('def456', '2026-08-27T13:06:39+00:00', 'gitdb: update:roles, auto-background @ 2026-08-27T13:06:39.411Z');

    const events = parseAuditLog(raw);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ commitHash: 'def456', entity: 'roles', action: 'update', trigger: 'auto-background' });
    expect(events[1]).toMatchObject({ commitHash: 'abc123', entity: 'organizations', action: 'insert', trigger: 'auto-background' });
  });

  it('agrupa varias razones en un mismo commit en eventos separados', () => {
    const raw = commitLine(
      'ghi789',
      '2026-08-27T13:10:00+00:00',
      'gitdb: insert:organizations, update:roles, auto-background @ 2026-08-27T13:10:00.000Z',
    );

    const events = parseAuditLog(raw);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.entity).sort()).toEqual(['organizations', 'roles']);
  });

  it('ignora commits que no siguen el formato de gitdb', () => {
    const raw = commitLine('zzz000', '2026-08-27T13:00:00+00:00', 'Initial commit');
    expect(parseAuditLog(raw)).toHaveLength(0);
  });

  it('filtra eventos por busqueda y pagina resultados', () => {
    const events = parseAuditLog(
      commitLine('a1', '2026-08-27T13:00:00+00:00', 'gitdb: insert:organizations, auto-background @ t1') +
        commitLine('a2', '2026-08-27T13:01:00+00:00', 'gitdb: update:roles, manual @ t2') +
        commitLine('a3', '2026-08-27T13:02:00+00:00', 'gitdb: delete:users, auto-background @ t3'),
    );

    const searched = filterAuditEvents(events, { search: 'roles' });
    expect(searched.total).toBe(1);
    expect(searched.events[0].entity).toBe('roles');

    const paged = filterAuditEvents(events, { limit: 1, offset: 1 });
    expect(paged.total).toBe(3);
    expect(paged.events).toHaveLength(1);
  });
});
