import { describe, expect, it } from 'vitest';
import { VaultDatabase } from '../../src/adapters/indexeddb/db.ts';
import { DexieVaultRepository } from '../../src/adapters/indexeddb/DexieVaultRepository.ts';
import { KnowledgeService } from '../../src/application/KnowledgeService.ts';
import { filesToVault, vaultToFiles } from '../../src/application/vaultFormat.ts';
import { VaultService } from '../../src/application/VaultService.ts';
import {
  addDays,
  addMonths,
  compareEvents,
  editSeries,
  expandEvents,
  mergeCalendars,
  monthGrid,
  occurrencesBetween,
  parseCalendar,
  startOfWeek,
  validateEvent,
  weekdayIndex,
  withException,
  type CalendarEvent,
} from '../../src/domain/calendar.ts';
import { isContentKind } from '../../src/domain/revision.ts';
import { sha256Hex } from '../../src/shared/hash.ts';

async function freshService() {
  const db = new VaultDatabase(`cal-${crypto.randomUUID()}`);
  const repo = new DexieVaultRepository(db);
  await repo.init();
  return { db, repo, service: new VaultService(repo) };
}

const event = (patch: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: crypto.randomUUID(),
  title: 'Escena de lluvia',
  date: '2026-10-13',
  endDate: '2026-10-13',
  start: '09:00',
  end: '10:30',
  color: 'mantequilla',
  ...patch,
});

describe('fechas del calendario (DESIGN.md §8)', () => {
  it('la cuadrícula de octubre de 2026 empieza el lunes 28 de septiembre y tiene 6 semanas', () => {
    const grid = monthGrid(2026, 10);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-09-28');
    expect(grid[3]).toBe('2026-10-01');
    expect(grid[41]).toBe('2026-11-08');
  });

  it('la semana empieza el lunes por defecto y se puede empezar en domingo', () => {
    expect(weekdayIndex('2026-10-13')).toBe(1); // martes
    expect(startOfWeek('2026-10-13')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-13', 0)).toBe('2026-10-11');
    expect(monthGrid(2026, 10, 0)[0]).toBe('2026-09-27');
  });

  it('suma días y meses sin depender de la zona horaria ni de los cambios de hora', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // fin de semana del cambio de hora
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01');
  });

  it('ordena: varios días, luego todo el día, luego por hora', () => {
    const trip = event({
      title: 'Viaje',
      date: '2026-10-12',
      endDate: '2026-10-14',
      start: null,
      end: null,
    });
    const allDay = event({ title: 'Entrega', start: null, end: null });
    const late = event({ title: 'Llamada', start: '15:00', end: '16:00' });
    const early = event({ title: 'Escena', start: '09:00', end: '10:00' });
    expect([late, early, allDay, trip].sort(compareEvents).map((e) => e.title)).toEqual([
      'Viaje',
      'Entrega',
      'Escena',
      'Llamada',
    ]);
  });
});

describe('modelo del calendario', () => {
  it('rechaza eventos incoherentes', () => {
    expect(() => validateEvent(event({ endDate: '2026-10-12' }))).toThrow(RangeError);
    expect(() => validateEvent(event({ end: null }))).toThrow(RangeError);
    expect(() => validateEvent(event({ start: '11:00', end: '10:00' }))).toThrow(RangeError);
    expect(validateEvent(event({ start: null, end: null })).start).toBeNull();
  });

  it('una versión posterior o un contenido inválido se abren en solo lectura', () => {
    expect(parseCalendar({ schemaVersion: 9, color: 'agua', events: [event()] })).toMatchObject({
      readOnly: 'unsupported-version',
    });
    expect(parseCalendar({ schemaVersion: 1, color: 'naranja', events: [] }).readOnly).toBe(
      'invalid-content',
    );
    expect(parseCalendar({ schemaVersion: 1, color: 'agua', events: [] }).readOnly).toBeNull();
  });
});

describe('calendarios y plantillas en el almacén (cambio de arquitectura 14/10/2026)', () => {
  it('crea, abre y guarda un calendario como revisiones inmutables', async () => {
    const { service } = await freshService();
    const doc = await service.createCalendar('Personal', 'agua');
    expect(doc.kind).toBe('calendar');
    expect(isContentKind(doc.kind)).toBe(false);

    const opened = await service.openCalendar(doc.id);
    expect(opened.calendar.events).toEqual([]);
    expect(opened.calendar.color).toBe('agua');

    const first = event();
    const saved = await service.saveCalendar(opened.session, {
      ...opened.calendar,
      events: [first],
    });
    // Guardar lo mismo no crea otra revisión: devuelve la misma cabeza.
    const same = await service.saveCalendar(opened.session, {
      ...opened.calendar,
      events: [first],
    });
    expect(same.revision.id).toBe(saved.revision.id);

    const reopened = await service.openCalendar(doc.id);
    expect(reopened.calendar.events).toEqual([first]);
    expect(await service.listHistory(doc.id)).toHaveLength(2);

    // Un evento inválido no llega a guardarse.
    await expect(
      service.saveCalendar(reopened.session, {
        ...reopened.calendar,
        events: [event({ endDate: '2026-01-01' })],
      }),
    ).rejects.toThrow(RangeError);
  });

  it('una plantilla guarda su escena y sus imágenes, y comprueba los hashes', async () => {
    const { service } = await freshService();
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const hash = await sha256Hex(bytes);
    const sceneJson = JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [{ id: 'a', type: 'image', fileId: hash }],
      files: { [hash]: { id: hash, mimeType: 'image/png', dataURL: `mindnote-asset:${hash}` } },
    });
    const doc = await service.createTemplate({
      title: 'Corazón con nota',
      canvas: { sceneJson, assets: [{ hash, mimeType: 'image/png', bytes }] },
    });
    expect(doc.kind).toBe('template');
    const opened = await service.openTemplate(doc.id);
    expect(opened.sceneJson).toBe(sceneJson);
    expect((await service.loadAsset(hash))?.bytes).toEqual(bytes);

    await expect(
      service.createTemplate({
        title: 'Rota',
        canvas: {
          sceneJson,
          assets: [{ hash, mimeType: 'image/png', bytes: new Uint8Array([0]) }],
        },
      }),
    ).rejects.toThrow(/hash/);
  });

  it('el formato abierto los conserva: calendario en .json y plantilla en .excalidraw', async () => {
    const { service } = await freshService();
    const calendar = await service.createCalendar('Proyectos', 'lavanda');
    const opened = await service.openCalendar(calendar.id);
    await service.saveCalendar(opened.session, { ...opened.calendar, events: [event()] });
    const template = await service.createTemplate({
      title: 'Vacía',
      canvas: { sceneJson: '{"type":"excalidraw","version":2,"elements":[]}', assets: [] },
    });

    const content = await service.exportContent();
    const files = vaultToFiles(content, { deviceId: crypto.randomUUID() });
    const head = (id: string) =>
      content.revisions.find(
        (r) => r.id === content.documents.find((d) => d.id === id)!.headRevisionIds[0],
      )!;
    expect(files.has(`objects/${head(calendar.id).contentRefs.body}.json`)).toBe(true);
    expect(files.has(`objects/${head(template.id).contentRefs.body}.excalidraw`)).toBe(true);

    const { content: back, problems } = await filesToVault(files);
    expect(problems).toEqual([]);
    expect(back.documents.find((d) => d.id === calendar.id)?.kind).toBe('calendar');
    expect(back.documents.find((d) => d.id === template.id)?.kind).toBe('template');
  });

  it('entran en el índice: eventos buscables y sus enlaces como backlinks (fase 7.E)', async () => {
    const { db, repo, service } = await freshService();
    const note = await service.createDocument('note', 'Guion');
    const calendar = await service.createCalendar('Personal', 'mantequilla');
    const opened = await service.openCalendar(calendar.id);
    const eventId = '0b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111';
    await service.saveCalendar(opened.session, {
      ...opened.calendar,
      events: [
        {
          id: eventId,
          title: 'Rodaje',
          date: '2026-10-20',
          endDate: '2026-10-20',
          start: null,
          end: null,
          color: 'agua',
          links: [{ url: `aline://document/${note.id}`, label: 'el guion' }],
        },
      ],
    });
    const knowledge = new KnowledgeService(
      repo,
      new (await import('../../src/adapters/indexeddb/DexieKnowledgeStore.ts')).DexieKnowledgeStore(
        db,
      ),
    );
    const search = await knowledge.reindex(calendar.id);
    expect(search?.elements).toEqual([{ elementId: eventId, text: 'Rodaje' }]);
    const backlinks = await knowledge.backlinks(note.id);
    expect(backlinks[0]?.link).toMatchObject({
      sourceElementId: eventId,
      kind: 'event',
      label: 'el guion',
      context: 'Rodaje',
    });
    // Un enlace a un evento que ya no existe pierde el ancla.
    const other = await service.createDocument('note', 'Otra');
    const otherNote = await service.openNote(other.id);
    await service.saveNote(
      otherNote.session,
      `[x](aline://document/${calendar.id}#ev=1b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111)`,
    );
    await knowledge.reindex(other.id);
    expect((await knowledge.outgoing(other.id))[0]?.status).toBe('anchor-lost');
  });
});

describe('colocación de eventos (DESIGN.md §8.2–8.3)', () => {
  const week = Array.from({ length: 7 }, (_, i) => addDays('2026-10-12', i));

  it('un viaje de varios días es una barra continua con esquinas solo en sus extremos', async () => {
    const { layoutWeek } = await import('../../src/features/calendar/layout.ts');
    const trip = event({
      title: 'Viaje',
      date: '2026-10-10',
      endDate: '2026-10-14',
      start: null,
      end: null,
    });
    const { segments } = layoutWeek(week, [trip]);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      startCol: 0,
      endCol: 2,
      startsHere: false,
      endsHere: true,
    });
  });

  it('una celda muestra hasta 3 eventos; con más, 2 y «+N más»', async () => {
    const { layoutWeek } = await import('../../src/features/calendar/layout.ts');
    const day = (n: number) =>
      Array.from({ length: n }, (_, i) => event({ start: `0${i}:00`, end: `0${i}:30` }));
    expect(layoutWeek(week, day(3)).hidden[1]).toBe(0);
    const four = layoutWeek(week, day(4));
    expect(four.hidden[1]).toBe(2);
    expect(four.segments).toHaveLength(2);
  });

  it('una barra se corta donde su carril no se ve y sigue donde sí', async () => {
    const { layoutWeek } = await import('../../src/features/calendar/layout.ts');
    // La barra queda en el carril 2: el martes (4 eventos) solo se ven 2 carriles.
    const busyTuesday = Array.from({ length: 3 }, (_, i) =>
      event({ title: `M${i}`, start: `0${i}:00`, end: `0${i}:30` }),
    );
    const blockers = [
      event({ title: 'A', date: '2026-10-12', endDate: '2026-10-15', start: null, end: null }),
      event({ title: 'B', date: '2026-10-12', endDate: '2026-10-15', start: null, end: null }),
    ];
    const bar = event({
      title: 'C',
      date: '2026-10-12',
      endDate: '2026-10-14',
      start: null,
      end: null,
    });
    const layout = layoutWeek(week, [...blockers, bar, ...busyTuesday]);
    const runs = layout.segments.filter((s) => s.event.title === 'C');
    expect(runs.map((r) => [r.startCol, r.endCol])).toEqual([
      [0, 0],
      [2, 2],
    ]);
    expect(layout.hidden[1]).toBeGreaterThan(0);
  });

  it('los bloques que se solapan se reparten el ancho', async () => {
    const { layoutDay } = await import('../../src/features/calendar/layout.ts');
    const blocks = layoutDay('2026-10-13', [
      event({ title: 'A', start: '09:00', end: '10:30' }),
      event({ title: 'B', start: '10:00', end: '11:00' }),
      event({ title: 'C', start: '11:00', end: '12:00' }),
    ]);
    const by = (t: string) => blocks.find((b) => b.event.title === t)!;
    expect([by('A').column, by('B').column, by('A').columns]).toEqual([0, 1, 2]);
    expect([by('C').column, by('C').columns]).toEqual([0, 1]);
    expect(by('A').top).toBe(9 * 60);
  });
});

describe('plantillas: copia con identidades nuevas', () => {
  const base = {
    angle: 0,
    isDeleted: false,
    frameId: null,
    boundElements: null,
    groupIds: [] as string[],
  };
  const elements = [
    {
      ...base,
      id: 'box',
      type: 'rectangle',
      x: 0,
      y: 0,
      groupIds: ['g1'],
      boundElements: [
        { id: 'label', type: 'text' },
        { id: 'arrow', type: 'arrow' },
      ],
    },
    { ...base, id: 'label', type: 'text', x: 10, y: 10, groupIds: ['g1'], containerId: 'box' },
    {
      ...base,
      id: 'arrow',
      type: 'arrow',
      x: 100,
      y: 0,
      startBinding: { elementId: 'box', focus: 0, gap: 1 },
      endBinding: { elementId: 'fuera', focus: 0, gap: 1 },
    },
    { ...base, id: 'img', type: 'image', x: 50, y: 50, fileId: 'abc' },
  ];

  it('renueva ids y grupos, mantiene los vínculos internos y suelta los externos', async () => {
    const { cloneElements } = await import('../../src/features/canvas/cloneElements.ts');
    let n = 0;
    const copies = cloneElements(
      elements as never,
      { x: 5, y: 7 },
      () => `n${++n}`,
    ) as unknown as Array<Record<string, unknown> & { id: string }>;
    const ids = copies.map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids.some((id) => ['box', 'label', 'arrow', 'img'].includes(id))).toBe(false);
    const [box, label, arrow, img] = copies;
    expect(box!['x']).toBe(5);
    expect(box!['groupIds']).toEqual(label!['groupIds']);
    expect(box!['groupIds']).not.toEqual(['g1']);
    expect(label!['containerId']).toBe(box!.id);
    expect((box!['boundElements'] as Array<{ id: string }>).map((b) => b.id)).toEqual([
      label!.id,
      arrow!.id,
    ]);
    expect(arrow!['startBinding']).toMatchObject({ elementId: box!.id });
    expect(arrow!['endBinding']).toBeNull();
    expect(img!['fileId']).toBe('abc');
  });

  it('la selección incluye el texto ligado a una forma elegida', async () => {
    const { selectionWithBound } = await import('../../src/features/canvas/cloneElements.ts');
    const chosen = selectionWithBound(elements as never, { box: true });
    expect(chosen.map((e) => e.id)).toEqual(['box', 'label']);
  });
});

describe('conflictos de un calendario (DESIGN.md §8.6)', () => {
  async function conflicted() {
    const { db, service } = await freshService();
    const doc = await service.createCalendar('Compartido', 'agua');
    const [base] = doc.headRevisionIds;
    const other = new VaultService(new DexieVaultRepository(new VaultDatabase(db.name)));
    const shared = event({ title: 'Ensayo', start: '10:00', end: '11:00' });
    const opened = await other.openCalendar(doc.id);
    // Ambos parten de la versión base: una añade «Del PC», la otra «Del iPad».
    const pc = event({ title: 'Del PC' });
    const ipad = event({ title: 'Del iPad', date: '2026-10-15', endDate: '2026-10-15' });
    await other.saveCalendar(opened.session, { ...opened.calendar, events: [shared, pc] });
    await service.saveCalendar(
      { documentId: doc.id, knownHeads: [base!], readOnly: null },
      { ...opened.calendar, events: [shared, ipad] },
    );
    expect(await service.conflictHeads(doc.id)).toHaveLength(2);
    return { service, doc, shared, pc, ipad };
  }

  it('combinar eventos junta los de todas las versiones y cierra el conflicto', async () => {
    const { service, doc, shared, pc, ipad } = await conflicted();
    const { result } = await service.resolveConflict(doc.id, { kind: 'merge-events' });
    expect(result.document.headRevisionIds).toHaveLength(1);
    expect(result.revision.operation).toBe('resolve');
    const merged = (await service.openCalendar(doc.id)).calendar.events.map((e) => e.id);
    expect(new Set(merged)).toEqual(new Set([shared.id, pc.id, ipad.id]));
    // Nada desaparece del historial.
    expect((await service.listHistory(doc.id)).length).toBeGreaterThanOrEqual(3);
  });

  it('conservar una versión o duplicar un calendario también funciona', async () => {
    const { service, doc } = await conflicted();
    const heads = await service.conflictHeads(doc.id);
    const { duplicate } = await service.resolveConflict(doc.id, {
      kind: 'duplicate',
      keepRevisionId: heads[0]!.id,
      copyRevisionId: heads[1]!.id,
      copyTitle: 'Compartido (copia)',
    });
    expect(duplicate?.kind).toBe('calendar');
    const copy = await service.openCalendar(duplicate!.id);
    expect(copy.calendar.events.map((e) => e.title)).toEqual(['Ensayo', 'Del iPad']);
  });

  it('la vista previa de una cabeza es un calendario', async () => {
    const { service, doc } = await conflicted();
    const [head] = await service.conflictHeads(doc.id);
    const preview = await service.previewRevision(head!.id);
    expect(preview.kind).toBe('calendar');
  });

  it('la fusión se queda con el evento de la versión más reciente', () => {
    const base = event({ title: 'Antes' });
    const merged = mergeCalendars([
      { schemaVersion: 1, color: 'agua', events: [base] },
      { schemaVersion: 1, color: 'agua', events: [{ ...base, title: 'Después' }] },
    ]);
    expect(merged.events.map((e) => e.title)).toEqual(['Después']);
  });
});

describe('enlaces de los eventos (fase 7.D)', () => {
  const doc = '8b53f815-9d38-4313-a1ad-cb690fabf23c';
  const base: CalendarEvent = {
    id: '0b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111',
    title: 'Rodaje',
    date: '2026-10-20',
    endDate: '2026-10-20',
    start: null,
    end: null,
    color: 'agua',
  };
  const calendar = (events: CalendarEvent[]) => ({
    schemaVersion: 1,
    color: 'agua',
    events,
  });

  it('un evento sin enlaces sigue siendo válido y los enlaces internos y web se aceptan', () => {
    const links = [
      { url: `aline://document/${doc}#t=la%20escena`, label: 'la escena' },
      { url: `mindnote://document/${doc}`, label: 'antiguo' },
      { url: 'https://example.com/guion', label: 'web' },
    ];
    expect(parseCalendar(calendar([base])).readOnly).toBeNull();
    const parsed = parseCalendar(calendar([{ ...base, links }]));
    expect(parsed.readOnly).toBeNull();
    expect(parsed.calendar.events[0]?.links).toEqual(links);
    expect(validateEvent({ ...base, links }).links).toEqual(links);
  });

  it('un enlace con otro esquema hace el calendario inválido (solo lectura, sin reescribir)', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'aline://document/no-uuid']) {
      const parsed = parseCalendar(calendar([{ ...base, links: [{ url, label: 'x' }] }]));
      expect(parsed.readOnly).toBe('invalid-content');
    }
  });

  it('la fusión de versiones en conflicto conserva los enlaces de la versión más reciente', () => {
    const older = { ...base, links: [{ url: 'https://a.example', label: 'a' }] };
    const newer = {
      ...base,
      title: 'Rodaje nocturno',
      links: [
        { url: 'https://a.example', label: 'a' },
        { url: `aline://document/${doc}`, label: 'guion' },
      ],
    };
    const other = { ...base, id: '1b8f6a8e-6a4f-4c7e-9c55-0e8d36b2c111', title: 'Otro' };
    const merged = mergeCalendars([
      parseCalendar(calendar([older, other])).calendar,
      parseCalendar(calendar([newer])).calendar,
    ]);
    expect(merged.events.find((e) => e.id === base.id)?.links).toEqual(newer.links);
    expect(merged.events.map((e) => e.title).sort()).toEqual(['Otro', 'Rodaje nocturno']);
  });
});

describe('eventos repetidos (plan 9.11)', () => {
  const dates = (e: CalendarEvent, from: string, to: string) =>
    occurrencesBetween(e, from, to).map((o) => o.date);

  it('diaria, cada N días, con fin por fecha o por número', () => {
    const daily = event({ recurrence: { freq: 'daily', interval: 2, until: '2026-10-21' } });
    expect(dates(daily, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-13',
      '2026-10-15',
      '2026-10-17',
      '2026-10-19',
      '2026-10-21',
    ]);
    const counted = event({ recurrence: { freq: 'daily', interval: 1, count: 3 } });
    expect(dates(counted, '2026-10-14', '2026-12-31')).toEqual(['2026-10-14', '2026-10-15']);
  });

  it('semanal en varios días, cada dos semanas, y una aparición quitada', () => {
    // Martes 13: lunes, miércoles y viernes, cada dos semanas (la semana del martes 13 cuenta).
    const weekly = event({
      recurrence: {
        freq: 'weekly',
        interval: 2,
        weekdays: [0, 2, 4],
        exceptions: ['2026-10-28'],
      },
    });
    expect(dates(weekly, '2026-10-01', '2026-11-08')).toEqual([
      '2026-10-14',
      '2026-10-16',
      '2026-10-26',
      '2026-10-30',
    ]);
  });

  it('mensual y anual repiten el día del mes y saltan los meses que no lo tienen', () => {
    const monthly = event({ date: '2026-01-31', endDate: '2026-01-31' });
    monthly.recurrence = { freq: 'monthly', interval: 1 };
    expect(dates(monthly, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
    ]);
    const leap = event({ date: '2028-02-29', endDate: '2028-02-29' });
    leap.recurrence = { freq: 'yearly', interval: 1 };
    expect(dates(leap, '2028-01-01', '2036-12-31')).toEqual([
      '2028-02-29',
      '2032-02-29',
      '2036-02-29',
    ]);
  });

  it('una aparición de varios días que empezó antes del intervalo también aparece', () => {
    const trip = event({ date: '2026-10-30', endDate: '2026-11-02' });
    trip.recurrence = { freq: 'monthly', interval: 1 };
    expect(occurrencesBetween(trip, '2026-11-01', '2026-11-30')).toMatchObject([
      { date: '2026-10-30', endDate: '2026-11-02', occurrence: '2026-10-30' },
      { date: '2026-11-30', endDate: '2026-12-03', occurrence: '2026-11-30' },
    ]);
  });

  it('expandEvents junta y ordena; un evento sin repetición no cambia', () => {
    const once = event({ title: 'Una vez', date: '2026-10-15', endDate: '2026-10-15' });
    const daily = event({ title: 'Diario', recurrence: { freq: 'daily', interval: 1 } });
    const shown = expandEvents([once, daily], '2026-10-15', '2026-10-15');
    expect(shown.map((e) => [e.title, e.occurrence])).toEqual([
      ['Diario', '2026-10-15'],
      ['Una vez', null],
    ]);
  });

  it('«solo este» deja una excepción; «toda la serie» desplaza la serie como la aparición', () => {
    const master = event({
      recurrence: { freq: 'weekly', interval: 1, exceptions: ['2026-10-27'] },
    });
    expect(withException(master, '2026-10-20').recurrence?.exceptions).toEqual([
      '2026-10-20',
      '2026-10-27',
    ]);
    // La aparición del 20 se mueve al 21 con otro título: toda la serie pasa al miércoles.
    const edited = { ...master, title: 'Otra', date: '2026-10-21', endDate: '2026-10-21' };
    const series = editSeries(master, '2026-10-20', edited);
    expect(series).toMatchObject({
      id: master.id,
      title: 'Otra',
      date: '2026-10-14',
      endDate: '2026-10-14',
      recurrence: { exceptions: ['2026-10-28'] },
    });
    // Quitar la repetición desde una aparición deja un evento suelto.
    expect(
      'recurrence' in editSeries(master, '2026-10-20', { ...edited, recurrence: undefined }),
    ).toBe(false);
  });

  it('valida la repetición y la conserva al leer; fin y número no van juntos', () => {
    expect(() =>
      validateEvent(event({ recurrence: { freq: 'daily', interval: 1, until: '2026-10-01' } })),
    ).toThrow(RangeError);
    expect(() =>
      validateEvent(
        event({ recurrence: { freq: 'daily', interval: 1, until: '2026-11-01', count: 3 } }),
      ),
    ).toThrow();
    const data = {
      schemaVersion: 1,
      color: 'agua',
      events: [event({ recurrence: { freq: 'yearly', interval: 1, futuro: 'x' } as never })],
    };
    const parsed = parseCalendar(JSON.parse(JSON.stringify(data)));
    expect(parsed.readOnly).toBeNull();
    expect(parsed.calendar.events[0]!.recurrence).toMatchObject({ freq: 'yearly', futuro: 'x' });
  });
});
