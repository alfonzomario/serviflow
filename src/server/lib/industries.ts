/**
 * Industry presets for onboarding.
 *
 * The common shape ServiFlow serves: a business that sends people to client
 * sites on a repeating cadence, where some jobs take more than one visit.
 * Everything a preset sets is a *starting point* — picking an industry never
 * locks anything, it just saves typing on day one. All of it stays editable
 * from Settings afterwards.
 *
 * Adding an industry here is the cheapest way to make the product feel native
 * to a new rubro, so keep this file the only place that knows about them.
 */

export type RecurrenceUnit = 'DAY' | 'WEEK' | 'MONTH';
export type RecurrenceAnchor = 'CALENDAR' | 'LAST_VISIT';

export type IndustryPreset = {
  id: string;
  label: string;
  /** One line shown under the option in the wizard. */
  description: string;
  recurrenceUnit: RecurrenceUnit;
  recurrenceInterval: number;
  /**
   * CALENDAR: the commitment belongs to a period ("el abono de agosto").
   * LAST_VISIT: the clock runs from whenever the last visit happened.
   */
  recurrenceAnchor: RecurrenceAnchor;
  /** Whether a one-off job also settles the period. */
  oneOffSettlesPeriod: boolean;
  /**
   * Minimum days between two applications of the same multi-visit job.
   * 0 when the rubro has no technical waiting period.
   */
  minDaysBetweenApplications: number;
  /** Typical on-site time, pre-fills the visit duration. */
  defaultDurationMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  serviceTypes: string[];
  /** What this rubro calls each of the three things it schedules. */
  labels: {
    /** The repeating commitment: "Abono", "Plan de mantenimiento", "Contrato". */
    recurringAgreement: string;
    /** A one-off job outside the agreement: "Especial", "Eventual". */
    oneOffVisit: string;
    /** A job that spans several visits: "Tratamiento", "Proyecto", "Obra". */
    multiVisitJob: string;
  };
};

export const INDUSTRY_PRESETS: IndustryPreset[] = [
  {
    id: 'fumigacion',
    label: 'Fumigación y control de plagas',
    description: 'Abonos mensuales y tratamientos de varias aplicaciones.',
    recurrenceUnit: 'MONTH',
    recurrenceInterval: 1,
    recurrenceAnchor: 'CALENDAR',
    oneOffSettlesPeriod: false,
    // The gap exists because eggs need time to hatch before the next pass.
    minDaysBetweenApplications: 15,
    defaultDurationMinutes: 45,
    workingHoursStart: '07:00',
    workingHoursEnd: '15:00',
    serviceTypes: [
      'Fumigación control',
      'Desratización',
      'Cucarachas',
      'Desinsectación',
      'Control de aves',
    ],
    labels: {
      recurringAgreement: 'Abono',
      oneOffVisit: 'Especial',
      multiVisitJob: 'Tratamiento',
    },
  },
  {
    id: 'piletas',
    label: 'Mantenimiento de piletas',
    description: 'Visitas semanales, más seguidas en verano.',
    recurrenceUnit: 'WEEK',
    recurrenceInterval: 1,
    recurrenceAnchor: 'LAST_VISIT',
    oneOffSettlesPeriod: true,
    minDaysBetweenApplications: 0,
    defaultDurationMinutes: 60,
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    serviceTypes: [
      'Mantenimiento semanal',
      'Puesta a punto',
      'Cambio de arena',
      'Invernada',
      'Reparación de bomba',
    ],
    labels: {
      recurringAgreement: 'Plan de mantenimiento',
      oneOffVisit: 'Trabajo puntual',
      multiVisitJob: 'Trabajo',
    },
  },
  {
    id: 'tanques',
    label: 'Limpieza de tanques de agua',
    description: 'Servicio semestral, con certificado por visita.',
    recurrenceUnit: 'MONTH',
    recurrenceInterval: 6,
    recurrenceAnchor: 'CALENDAR',
    oneOffSettlesPeriod: false,
    minDaysBetweenApplications: 0,
    defaultDurationMinutes: 120,
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    serviceTypes: [
      'Limpieza y desinfección',
      'Análisis bacteriológico',
      'Reparación de tanque',
    ],
    labels: {
      recurringAgreement: 'Contrato',
      oneOffVisit: 'Servicio puntual',
      multiVisitJob: 'Trabajo',
    },
  },
  {
    id: 'jardineria',
    label: 'Jardinería y parquización',
    description: 'Visitas quincenales, más espaciadas fuera de temporada.',
    recurrenceUnit: 'WEEK',
    recurrenceInterval: 2,
    recurrenceAnchor: 'LAST_VISIT',
    oneOffSettlesPeriod: true,
    minDaysBetweenApplications: 0,
    defaultDurationMinutes: 120,
    workingHoursStart: '07:00',
    workingHoursEnd: '16:00',
    serviceTypes: [
      'Corte de césped',
      'Poda',
      'Fertilización',
      'Control de malezas',
      'Diseño y plantación',
    ],
    labels: {
      recurringAgreement: 'Abono',
      oneOffVisit: 'Trabajo puntual',
      multiVisitJob: 'Proyecto',
    },
  },
  {
    id: 'climatizacion',
    label: 'Climatización y aire acondicionado',
    description: 'Mantenimiento semestral, antes de verano e invierno.',
    recurrenceUnit: 'MONTH',
    recurrenceInterval: 6,
    recurrenceAnchor: 'CALENDAR',
    oneOffSettlesPeriod: true,
    minDaysBetweenApplications: 0,
    defaultDurationMinutes: 90,
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    serviceTypes: [
      'Mantenimiento preventivo',
      'Carga de gas',
      'Limpieza de filtros',
      'Instalación',
      'Reparación',
    ],
    labels: {
      recurringAgreement: 'Contrato',
      oneOffVisit: 'Service',
      multiVisitJob: 'Obra',
    },
  },
  {
    id: 'matafuegos',
    label: 'Matafuegos y protección contra incendios',
    description: 'Control periódico y recarga anual, con vencimientos.',
    recurrenceUnit: 'MONTH',
    recurrenceInterval: 12,
    recurrenceAnchor: 'CALENDAR',
    oneOffSettlesPeriod: false,
    minDaysBetweenApplications: 0,
    defaultDurationMinutes: 60,
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    serviceTypes: [
      'Recarga',
      'Control periódico',
      'Prueba hidráulica',
      'Señalización',
    ],
    labels: {
      recurringAgreement: 'Contrato',
      oneOffVisit: 'Trabajo puntual',
      multiVisitJob: 'Trabajo',
    },
  },
  {
    id: 'limpieza',
    label: 'Limpieza y desinfección',
    description: 'Visitas periódicas a oficinas, consorcios o locales.',
    recurrenceUnit: 'WEEK',
    recurrenceInterval: 1,
    recurrenceAnchor: 'CALENDAR',
    oneOffSettlesPeriod: true,
    minDaysBetweenApplications: 0,
    defaultDurationMinutes: 120,
    workingHoursStart: '07:00',
    workingHoursEnd: '18:00',
    serviceTypes: [
      'Limpieza periódica',
      'Limpieza profunda',
      'Desinfección',
      'Limpieza de alfombras',
      'Vidrios en altura',
    ],
    labels: {
      recurringAgreement: 'Contrato',
      oneOffVisit: 'Trabajo puntual',
      multiVisitJob: 'Trabajo',
    },
  },
  {
    id: 'custom',
    label: 'Otro rubro',
    description: 'Arrancás en blanco y configurás todo a tu medida.',
    recurrenceUnit: 'MONTH',
    recurrenceInterval: 1,
    recurrenceAnchor: 'CALENDAR',
    oneOffSettlesPeriod: false,
    minDaysBetweenApplications: 0,
    defaultDurationMinutes: 60,
    workingHoursStart: '08:00',
    workingHoursEnd: '17:00',
    serviceTypes: [],
    labels: {
      recurringAgreement: 'Contrato',
      oneOffVisit: 'Trabajo puntual',
      multiVisitJob: 'Trabajo',
    },
  },
];

export const getIndustryPreset = (id: string | null | undefined): IndustryPreset =>
  INDUSTRY_PRESETS.find((preset) => preset.id === id) ??
  INDUSTRY_PRESETS[INDUSTRY_PRESETS.length - 1]; // 'custom'

const UNIT_LABELS: Record<RecurrenceUnit, [string, string]> = {
  DAY: ['día', 'días'],
  WEEK: ['semana', 'semanas'],
  MONTH: ['mes', 'meses'],
};

/** "cada 1 mes" / "cada 2 semanas" / "cada 6 meses" */
export const describeCadence = (unit: RecurrenceUnit, interval: number): string => {
  const [singular, plural] = UNIT_LABELS[unit];
  return interval === 1 ? `cada ${singular}` : `cada ${interval} ${plural}`;
};
