import { describe, expect, it } from 'vitest';
import {
  addCadence,
  buildPendingItems,
  checkApplicationGap,
  type PendingClient,
  type PendingJob,
  type PendingVisit,
  type PendingItem,
  type TenantDefaults,
} from './pending';

const JULY = new Date(2026, 6, 1); // month being planned
const TODAY = new Date(2026, 6, 20); // 20 July 2026

const defaults: TenantDefaults = {
  recurrenceUnit: 'MONTH',
  recurrenceInterval: 1,
  recurrenceAnchor: 'CALENDAR',
  oneOffSettlesPeriod: false,
  minDaysBetweenApplications: 15,
};

const fromLastVisit: TenantDefaults = { ...defaults, recurrenceAnchor: 'LAST_VISIT' };

const client = (overrides: Partial<PendingClient> = {}): PendingClient => ({
  id: 'client-1',
  name: 'María García',
  address: 'Av. Libertador 1500',
  phone: '(11) 5555-0001',
  serviceTypes: ['Fumigación control'],
  relationshipType: 'CONTRACT',
  status: 'ACTIVE',
  recurrenceUnit: null,
  recurrenceInterval: null,
  minDaysBetweenApplications: null,
  ...overrides,
});

const visit = (overrides: Partial<PendingVisit> = {}): PendingVisit => ({
  id: 'visit-1',
  clientId: 'client-1',
  requestId: null,
  jobId: null,
  scheduledAt: new Date(2026, 6, 10),
  visitType: 'CONTRACT',
  status: 'CONFIRMED',
  serviceType: 'Fumigación control',
  applicationNumber: null,
  ...overrides,
});

const job = (overrides: Partial<PendingJob> = {}): PendingJob => ({
  id: 'job-1',
  clientId: 'client-1',
  requestId: null,
  serviceType: 'Fumigación control',
  totalApplications: 3,
  closed: false,
  ...overrides,
});

const build = (
  visits: PendingVisit[],
  clients = [client()],
  tenantDefaults = defaults,
  jobs: PendingJob[] = []
) =>
  buildPendingItems({
    targetMonth: JULY,
    today: TODAY,
    defaults: tenantDefaults,
    clients,
    visits,
    jobs,
  });

const kinds = (items: PendingItem[]) => items.map((item) => item.kind);

describe('addCadence', () => {
  it('camina el calendario para los meses, no suma 30 días', () => {
    expect(addCadence(new Date(2026, 0, 15), 'MONTH', 1)).toEqual(new Date(2026, 1, 15));
  });

  it('no se pasa de mes cuando el día no existe', () => {
    // 31 de enero + 1 mes debe caer en el último día de febrero, no en marzo.
    expect(addCadence(new Date(2026, 0, 31), 'MONTH', 1)).toEqual(new Date(2026, 1, 28));
  });

  it('soporta semanas y días', () => {
    expect(addCadence(new Date(2026, 6, 1), 'WEEK', 2)).toEqual(new Date(2026, 6, 15));
    expect(addCadence(new Date(2026, 6, 1), 'DAY', 10)).toEqual(new Date(2026, 6, 11));
  });
});

describe('servicios recurrentes', () => {
  it('marca pendiente al contrato que nunca tuvo visita', () => {
    const items = build([]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'RECURRING_SERVICE', daysOverdue: 0 });
  });

  it('no lo marca si la próxima todavía no vence', () => {
    // Visita el 10/07, cadencia mensual -> vence el 10/08, fuera de julio.
    expect(build([visit({ scheduledAt: new Date(2026, 6, 10) })])).toHaveLength(0);
  });

  it('lo marca cuando el período planificado no tiene visita', () => {
    // Anclaje calendario: la del 25/06 cubre junio, julio queda debiendo desde
    // el día 1.
    const items = build([visit({ scheduledAt: new Date(2026, 5, 25) })]);

    expect(items[0]).toMatchObject({ kind: 'RECURRING_SERVICE', dueAt: new Date(2026, 6, 1) });
  });

  it('arrastra y cuenta los días de atraso', () => {
    // Última en abril -> mayo quedó debiendo desde el 01/05, hoy es 20/07.
    const items = build([visit({ scheduledAt: new Date(2026, 3, 12) })]);

    expect(items[0]).toMatchObject({
      kind: 'RECURRING_SERVICE',
      dueAt: new Date(2026, 4, 1),
      daysOverdue: 80,
    });
  });

  it('con anclaje "desde la última visita" el reloj corre desde la fecha', () => {
    // Misma visita del 25/06, pero contando 1 mes desde ese día.
    const items = build([visit({ scheduledAt: new Date(2026, 5, 25) })], [client()], fromLastVisit);

    expect(items[0]).toMatchObject({ dueAt: new Date(2026, 6, 25) });
  });

  it('con anclaje de calendario, cualquier visita del período lo salda', () => {
    // Fue el 10/07: julio está cubierto aunque falten días para el mes que viene.
    expect(build([visit({ scheduledAt: new Date(2026, 6, 10) })])).toHaveLength(0);
  });

  it('respeta una cadencia semestral: no lo pide todos los meses', () => {
    const semestral = client({ recurrenceUnit: 'MONTH', recurrenceInterval: 6 });
    // Limpieza en mayo -> la próxima recién en noviembre.
    const items = build([visit({ scheduledAt: new Date(2026, 4, 10) })], [semestral]);

    expect(items).toHaveLength(0);
  });

  it('respeta una cadencia semanal', () => {
    const semanal = client({ recurrenceUnit: 'WEEK', recurrenceInterval: 1 });
    // Visita el miércoles 08/07 -> la semana siguiente arranca el lunes 13/07.
    const items = build([visit({ scheduledAt: new Date(2026, 6, 8) })], [semanal]);

    expect(items[0]).toMatchObject({ dueAt: new Date(2026, 6, 13), daysOverdue: 7 });
  });

  it('el override del cliente pisa el default del negocio', () => {
    const quincenal = client({ recurrenceUnit: 'WEEK', recurrenceInterval: 2 });
    const items = build([visit({ scheduledAt: new Date(2026, 6, 1) })], [quincenal]);

    expect(items[0]).toMatchObject({ cadence: { unit: 'WEEK', interval: 2 } });
  });

  it('saca el pendiente aunque la visita esté cancelada: la decisión ya se tomó', () => {
    expect(build([visit({ status: 'CANCELLED' })])).toHaveLength(0);
  });

  it('una visita especial no cubre el servicio recurrente', () => {
    const items = build([visit({ visitType: 'SPECIAL' })]);

    expect(kinds(items)).toContain('RECURRING_SERVICE');
  });

  it('un período saldado sin visita cierra el compromiso pero no cuenta como visita', () => {
    const items = build([
      visit({ id: 'real', scheduledAt: new Date(2026, 3, 12), status: 'COMPLETED' }),
      visit({ id: 'saldado', scheduledAt: new Date(2026, 4, 1), status: 'SKIPPED' }),
    ]);

    // Mayo quedó saldado -> el próximo se debe desde junio.
    expect(items[0]).toMatchObject({
      dueAt: new Date(2026, 5, 1),
      lastVisitAt: new Date(2026, 3, 12),
    });
  });

  it('ignora clientes inactivos y ocasionales', () => {
    expect(build([], [client({ status: 'INACTIVE' })])).toHaveLength(0);
    expect(build([], [client({ relationshipType: 'ON_DEMAND' })])).toHaveLength(0);
  });
});

describe('abono y visita puntual conviviendo', () => {
  it('una visita puntual no salda el abono del período', () => {
    // Última del abono en junio -> vence el 25/07. En julio hubo además una
    // visita puntual por una eventualidad, que no reemplaza al abono.
    const items = build([
      visit({ id: 'abono', scheduledAt: new Date(2026, 5, 25), visitType: 'CONTRACT' }),
      visit({ id: 'puntual', scheduledAt: new Date(2026, 6, 8), visitType: 'SPECIAL' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'RECURRING_SERVICE', dueAt: new Date(2026, 6, 1) });
  });

  it('si el rubro lo define así, la puntual sí salda el período', () => {
    // Un jardinero que fue y cortó puede dar el mes por hecho.
    const items = build(
      [
        visit({ id: 'abono', scheduledAt: new Date(2026, 5, 25), visitType: 'CONTRACT' }),
        visit({ id: 'puntual', scheduledAt: new Date(2026, 6, 8), visitType: 'SPECIAL' }),
      ],
      [client()],
      { ...defaults, oneOffSettlesPeriod: true }
    );

    expect(items).toHaveLength(0);
  });

  it('el abono puede ser de varias aplicaciones y seguir cubriendo el período', () => {
    // Abono de 2 aplicaciones: la 1 está agendada este mes.
    const items = build(
      [
        visit({
          id: 'abono-1',
          scheduledAt: new Date(2026, 6, 5),
          visitType: 'CONTRACT',
          jobId: 'abono-jul',
          applicationNumber: 1,
        }),
      ],
      [client()],
      defaults,
      [job({ id: 'abono-jul', totalApplications: 2 })]
    );

    // El período queda cubierto, pero falta agendar la segunda aplicación.
    expect(kinds(items)).toEqual(['MISSING_APPLICATION']);
    expect(items[0]).toMatchObject({ applicationNumber: 2, totalApplications: 2 });
  });

  it('un abono multi-aplicación y un trabajo puntual no se mezclan', () => {
    const items = build(
      [
        visit({
          id: 'abono-1',
          scheduledAt: new Date(2026, 6, 5),
          visitType: 'CONTRACT',
          jobId: 'abono-jul',
          applicationNumber: 1,
        }),
        visit({
          id: 'esp-1',
          scheduledAt: new Date(2026, 6, 9),
          visitType: 'SPECIAL',
          jobId: 'urgencia-cucarachas',
          applicationNumber: 1,
        }),
      ],
      [client()],
      defaults,
      [
        job({ id: 'abono-jul', totalApplications: 2 }),
        job({ id: 'urgencia-cucarachas', totalApplications: 3 }),
      ]
    );

    // Dos trabajos abiertos distintos, cada uno pidiendo su propia próxima.
    const missing = items.filter((item) => item.kind === 'MISSING_APPLICATION');
    expect(missing).toHaveLength(2);
    expect(missing.map((item) => (item as { totalApplications: number }).totalApplications))
      .toEqual(expect.arrayContaining([2, 3]));
  });
});

describe('trabajos de varias aplicaciones', () => {
  const jobClient = client({ relationshipType: 'ON_DEMAND' });
  const jobs = [job({ id: 'job-1', totalApplications: 3 })];

  const application = (number: number, overrides: Partial<PendingVisit> = {}) =>
    visit({
      id: `app-${number}`,
      visitType: 'SPECIAL',
      jobId: 'job-1',
      applicationNumber: number,
      ...overrides,
    });

  const buildJob = (
    visits: PendingVisit[],
    clients = [jobClient],
    tenantDefaults = defaults,
    jobRows = jobs
  ) => build(visits, clients, tenantDefaults, jobRows);

  it('pide la próxima aplicación cuando falta', () => {
    const items = buildJob([application(1)]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'MISSING_APPLICATION',
      applicationNumber: 2,
      totalApplications: 3,
    });
  });

  it('muestra una sola aplicación por vez, no toda la cola', () => {
    const items = buildJob([application(1)]);

    expect(items.filter((item) => item.kind === 'MISSING_APPLICATION')).toHaveLength(1);
  });

  it('calcula desde cuándo se puede hacer la próxima', () => {
    // Aplicación 1 el 10/07 + 15 días mínimo -> a partir del 25/07.
    const items = buildJob([application(1, { scheduledAt: new Date(2026, 6, 10) })]);

    expect(items[0]).toMatchObject({
      earliestAt: new Date(2026, 6, 25),
      notYetDue: true, // hoy es 20/07
    });
  });

  it('deja de estar "todavía no toca" una vez pasada la fecha', () => {
    const items = buildJob([application(1, { scheduledAt: new Date(2026, 5, 1) })]);

    expect(items[0]).toMatchObject({ notYetDue: false });
  });

  it('sin mínimo configurado no propone fecha', () => {
    const items = buildJob([application(1)], [jobClient], {
      ...defaults,
      minDaysBetweenApplications: 0,
    });

    expect(items[0]).toMatchObject({ earliestAt: null, notYetDue: false });
  });

  it('el mínimo del cliente pisa al del negocio', () => {
    const slower = client({ relationshipType: 'ON_DEMAND', minDaysBetweenApplications: 30 });
    const items = buildJob([application(1, { scheduledAt: new Date(2026, 6, 1) })], [slower]);

    expect(items[0]).toMatchObject({ earliestAt: new Date(2026, 6, 31) });
  });

  it('deja de pedirla en cuanto se agenda, sin importar el estado', () => {
    const items = buildJob([application(1), application(2, { status: 'PENDING_CONFIRM' })]);

    expect(items[0]).toMatchObject({ applicationNumber: 3 });
  });

  it('una aplicación cancelada no vuelve a pendientes', () => {
    const items = buildJob([application(1), application(2, { status: 'CANCELLED' })]);

    expect(items[0]).toMatchObject({ applicationNumber: 3 });
  });

  it('no pide nada cuando el trabajo está completo', () => {
    const items = buildJob([application(1), application(2), application(3)]);

    expect(items).toHaveLength(0);
  });

  it('un trabajo cerrado deja de pedir aplicaciones', () => {
    const items = buildJob([application(1)], [jobClient], defaults, [
      job({ id: 'job-1', totalApplications: 3, closed: true }),
    ]);

    expect(items).toHaveLength(0);
  });

  it('mantiene separados dos trabajos simultáneos del mismo cliente', () => {
    const items = buildJob(
      [
        application(1, { id: 'a1', jobId: 'job-1' }),
        application(1, { id: 'b1', jobId: 'job-2' }),
      ],
      [jobClient],
      defaults,
      [job({ id: 'job-1' }), job({ id: 'job-2' })]
    );

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === 'MISSING_APPLICATION')).toBe(true);
  });

  it('una aplicación sin fecha cuenta como faltante, no como visita suelta', () => {
    const items = buildJob([application(1), application(2, { scheduledAt: null })]);

    expect(kinds(items)).toEqual(['MISSING_APPLICATION']);
    expect(items[0]).toMatchObject({ applicationNumber: 2 });
  });

  it('un trabajo sin ninguna visita pide la primera aplicación', () => {
    // Antes de que Trabajo fuera una entidad esto no se podía ni expresar: el
    // trabajo existía solamente a través de sus visitas.
    const items = buildJob([]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'MISSING_APPLICATION',
      applicationNumber: 1,
      totalApplications: 3,
      previousApplicationAt: null,
      earliestAt: null,
    });
  });

  it('el trabajo, no la visita, manda sobre cuántas aplicaciones son', () => {
    // El alambre viejo agrupaba por clientId|totalApplications|requestId, así
    // que subir el total partía el trabajo en dos: las visitas ya cargadas
    // conservaban el total viejo y formaban un grupo fantasma.
    const items = buildJob([application(1), application(2)], [jobClient], defaults, [
      job({ id: 'job-1', totalApplications: 4 }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ applicationNumber: 3, totalApplications: 4 });
  });

  it('bajar el total por debajo de lo agendado no pide nada ni rompe', () => {
    const items = buildJob([application(1), application(2), application(3)], [jobClient], defaults, [
      job({ id: 'job-1', totalApplications: 2 }),
    ]);

    expect(items).toHaveLength(0);
  });

  it('el tipo de servicio del trabajo le gana al de la visita', () => {
    const items = buildJob(
      [application(1, { serviceType: 'Lo que diga la visita' })],
      [jobClient],
      defaults,
      [job({ id: 'job-1', serviceType: 'Cucarachas' })]
    );

    expect(items[0]).toMatchObject({ serviceType: 'Cucarachas' });
  });

  it('ignora trabajos de clientes inactivos', () => {
    const items = buildJob([application(1)], [
      client({ relationshipType: 'ON_DEMAND', status: 'INACTIVE' }),
    ]);

    expect(items).toHaveLength(0);
  });
});

describe('visitas sin fecha', () => {
  const onDemand = client({ relationshipType: 'ON_DEMAND' });

  it('lista la visita creada sin turno', () => {
    const items = build(
      [visit({ scheduledAt: null, visitType: 'SPECIAL', status: 'PENDING_CONFIRM' })],
      [onDemand]
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'UNSCHEDULED_VISIT', visitId: 'visit-1' });
  });

  it('ignora las canceladas sin fecha', () => {
    const items = build(
      [visit({ scheduledAt: null, visitType: 'SPECIAL', status: 'CANCELLED' })],
      [onDemand]
    );

    expect(items).toHaveLength(0);
  });
});

describe('checkApplicationGap', () => {
  it('avisa cuando la fecha elegida es muy temprana', () => {
    const result = checkApplicationGap(new Date(2026, 6, 10), new Date(2026, 6, 20), 15);

    expect(result).toEqual({ earliestAt: new Date(2026, 6, 25), daysShort: 5 });
  });

  it('no avisa cuando ya pasó el mínimo', () => {
    expect(checkApplicationGap(new Date(2026, 6, 1), new Date(2026, 6, 20), 15)).toBeNull();
  });

  it('no avisa sin aplicación previa o sin mínimo', () => {
    expect(checkApplicationGap(null, new Date(2026, 6, 20), 15)).toBeNull();
    expect(checkApplicationGap(new Date(2026, 6, 19), new Date(2026, 6, 20), 0)).toBeNull();
  });
});
