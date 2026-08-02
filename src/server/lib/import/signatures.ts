/**
 * Qué campos se pueden importar y cómo se llaman en el archivo del cliente.
 *
 * Este es el único archivo que conoce los campos importables, igual que
 * `industries.ts` es el único que conoce los rubros: sumar un campo es una
 * entrada más acá, no un cambio en el motor.
 *
 * Los alias son lo que hace que el importador sea universal. Nadie exporta su
 * planilla con los nombres de nuestro schema — exporta "Razón Social", "Cel",
 * "Domicilio". Cuantos más alias, menos mapeo manual tiene que hacer el usuario.
 */

export type FieldType =
  | 'string'
  | 'email'
  | 'phone'
  | 'date'
  | 'currency'
  | 'integer'
  | 'enum'
  | 'list';

export type ColumnSignature = {
  /** Nombre del campo en el modelo. */
  field: string;
  /** Cómo se muestra en el selector de mapeo. */
  label: string;
  /** Encabezados que se reconocen automáticamente. Todo en minúscula. */
  aliases: string[];
  type: FieldType;
  required?: boolean;
  /**
   * Para `enum`: cada clave es el valor canónico y el array son las formas en
   * que la gente lo escribe. La comparación es en minúscula y sin acentos.
   */
  enumValues?: Record<string, string[]>;
  /** Texto de ayuda bajo el selector. */
  hint?: string;
};

export type ImportEntity = 'clients' | 'visits' | 'transactions';

export type EntityConfig = {
  label: string;
  description: string;
  fields: ColumnSignature[];
  /**
   * Con qué campos se decide que dos filas son la misma cosa. Se comparan
   * normalizados y concatenados.
   */
  dedupeFields: string[];
  /**
   * Si la entidad cuelga de un cliente, cuál es el campo del archivo que trae
   * su nombre. La resolución contra los clientes existentes se hace aparte.
   */
  clientNameField?: string;
  /**
   * Si una fila sin cliente resuelto se descarta o entra igual. Una visita sin
   * cliente no significa nada; un gasto de nafta sin cliente es lo normal.
   */
  clientRequired?: boolean;
};

const CLIENT_SIGNATURES: ColumnSignature[] = [
  {
    field: 'name',
    label: 'Nombre',
    aliases: [
      'nombre',
      'name',
      'cliente',
      'client',
      'razon social',
      'razón social',
      'apellido y nombre',
      'nombre y apellido',
      'titular',
    ],
    type: 'string',
    required: true,
  },
  {
    field: 'email',
    label: 'Email',
    aliases: ['email', 'correo', 'e-mail', 'mail', 'correo electronico', 'correo electrónico'],
    type: 'email',
  },
  {
    field: 'phone',
    label: 'Teléfono',
    aliases: [
      'telefono',
      'teléfono',
      'phone',
      'tel',
      'celular',
      'movil',
      'móvil',
      'whatsapp',
      'cel',
      'contacto',
    ],
    type: 'phone',
  },
  {
    field: 'address',
    label: 'Dirección',
    aliases: [
      'direccion',
      'dirección',
      'address',
      'domicilio',
      'ubicacion',
      'ubicación',
      'calle',
    ],
    type: 'string',
  },
  {
    field: 'relationshipType',
    label: 'Tipo de relación',
    aliases: ['tipo', 'tipo de cliente', 'relacion', 'relación', 'modalidad', 'abono'],
    type: 'enum',
    // `ESPECIAL` es como la app vieja marca al cliente sin abono.
    enumValues: {
      CONTRACT: ['abono', 'contrato', 'contract', 'mensual', 'recurrente', 'fijo', 'si', 'sí'],
      ON_DEMAND: [
        'ocasional',
        'puntual',
        'especial',
        'on demand',
        'eventual',
        'esporadico',
        'esporádico',
        'no',
      ],
    },
    hint: 'Si no se mapea, todos entran como ocasionales.',
  },
  {
    field: 'status',
    label: 'Estado',
    aliases: ['estado', 'status', 'activo', 'situacion', 'situación'],
    type: 'enum',
    enumValues: {
      ACTIVE: ['activo', 'active', 'alta', 'si', 'sí', 'vigente'],
      INACTIVE: ['inactivo', 'inactive', 'baja', 'no', 'suspendido'],
    },
    hint: 'Si no se mapea, todos entran como activos.',
  },
  {
    field: 'serviceTypes',
    label: 'Servicios',
    aliases: [
      'servicios',
      'servicio',
      'service types',
      'tipo de servicio',
      'tipos de servicio',
      'plagas',
      'tratamientos',
    ],
    type: 'list',
    hint: 'Separados por coma, punto y coma o barra.',
  },
  {
    field: 'notes',
    label: 'Notas',
    aliases: ['notas', 'notes', 'observaciones', 'comentarios', 'obs', 'detalle'],
    type: 'string',
  },
];

/**
 * Visitas. A diferencia de clientes, una visita no se sostiene sola: cuelga de
 * un cliente que ya tiene que existir. Por eso `clientName` es obligatorio y se
 * resuelve contra la base antes de escribir nada.
 *
 * Importar el historial de visitas no es un extra: sin él, un negocio que
 * importa 200 clientes con abono abre Pendientes y ve 200 items venciendo hoy,
 * porque no hay ninguna visita previa con la cual calcular el próximo
 * vencimiento.
 */
const VISIT_SIGNATURES: ColumnSignature[] = [
  {
    field: 'clientName',
    label: 'Cliente',
    aliases: [
      'cliente',
      'client',
      'nombre',
      'name',
      'razon social',
      'razón social',
      'nombre del cliente',
    ],
    type: 'string',
    required: true,
    hint: 'Se busca por nombre entre los clientes que ya tenés cargados.',
  },
  {
    field: 'scheduledAt',
    label: 'Fecha',
    aliases: [
      'fecha',
      'date',
      'dia',
      'día',
      'fecha visita',
      'fecha de visita',
      'fecha servicio',
      'fecha del servicio',
    ],
    type: 'date',
    required: true,
  },
  {
    field: 'serviceType',
    label: 'Tipo de servicio',
    // `pestTypes` es como la app vieja llama a esta columna.
    aliases: [
      'servicio',
      'tipo de servicio',
      'service',
      'tratamiento',
      'trabajo',
      'plaga',
      'plagas',
      'pesttypes',
      'pest types',
    ],
    type: 'string',
  },
  {
    field: 'status',
    label: 'Estado',
    aliases: ['estado', 'status', 'situacion', 'situación'],
    type: 'enum',
    // Los valores en MAYÚSCULA_CON_GUION son los de la app vieja de Apps Script
    // (`legacy/index.html`). Sin ellos la migración los daba por no reconocidos
    // y caía al default: una visita OMITIDA_MES habría entrado como realizada,
    // contando como visita de verdad un período que se saldó sin ir.
    enumValues: {
      COMPLETED: ['realizada', 'completada', 'hecha', 'done', 'completed', 'ok', 'si', 'sí'],
      CONFIRMED: ['confirmada', 'confirmed', 'agendada'],
      PENDING_CONFIRM: [
        'programada',
        'scheduled',
        'pendiente',
        'a confirmar',
        'por confirmar',
        'por_confirmar',
      ],
      CANCELLED: ['cancelada', 'cancelled', 'canceled', 'anulada'],
      SKIPPED: [
        'omitida',
        'saltada',
        'skipped',
        'no se hizo',
        'omitida mes',
        'omitida_mes',
      ],
    },
    hint: 'Sin mapear, las visitas con fecha pasada entran como completadas.',
  },
  {
    field: 'visitType',
    label: 'Tipo de visita',
    // `type` es el nombre de la columna en la hoja Visits de la app vieja.
    aliases: ['tipo', 'type', 'modalidad', 'tipo de visita', 'abono'],
    type: 'enum',
    enumValues: {
      CONTRACT: ['abono', 'contrato', 'contract', 'mensual', 'recurrente', 'si', 'sí'],
      SPECIAL: ['especial', 'puntual', 'special', 'ocasional', 'extra', 'no'],
    },
    hint: 'Solo las de abono cubren el período recurrente del cliente.',
  },
  {
    field: 'applicationNumber',
    label: 'Nº de aplicación',
    aliases: [
      'aplicacion',
      'aplicación',
      'nro aplicacion',
      'numero de aplicacion',
      'número de aplicación',
      'application',
      'visita nro',
      'orden',
    ],
    type: 'integer',
    hint: 'Qué número de aplicación es dentro del tratamiento. Va junto con el total.',
  },
  {
    field: 'totalApplications',
    label: 'Total de aplicaciones',
    aliases: [
      'total aplicaciones',
      'total de aplicaciones',
      'cantidad de aplicaciones',
      'aplicaciones',
      'total',
      'de',
    ],
    type: 'integer',
    hint: 'Mapeá esta columna para que las visitas se agrupen en un tratamiento.',
  },
  {
    field: 'price',
    label: 'Precio',
    aliases: ['precio', 'price', 'monto', 'valor', 'importe', 'costo', 'tarifa', 'cobrado'],
    type: 'currency',
  },
  {
    field: 'paymentStatus',
    label: 'Cobro',
    aliases: ['cobro', 'pago', 'pagado', 'payment', 'cobrado', 'estado de pago'],
    type: 'enum',
    enumValues: {
      PAID: ['pagado', 'cobrado', 'paid', 'si', 'sí', 'ok'],
      PENDING: ['pendiente', 'debe', 'a cobrar', 'no', 'impago'],
      WAIVED: ['sin cargo', 'bonificado', 'gratis', 'waived'],
    },
  },
  {
    field: 'notes',
    label: 'Notas',
    aliases: ['notas', 'notes', 'observaciones', 'comentarios', 'obs', 'detalle'],
    type: 'string',
  },
];

/**
 * Movimientos de caja. El cliente es **opcional**: los ingresos suelen tenerlo,
 * los gastos casi nunca. Una fila sin cliente reconocido entra igual, sin
 * enganche, en vez de perderse.
 */
const TRANSACTION_SIGNATURES: ColumnSignature[] = [
  {
    field: 'transactionDate',
    label: 'Fecha',
    aliases: ['fecha', 'date', 'dia', 'día', 'fecha de pago', 'fecha movimiento'],
    type: 'date',
    required: true,
  },
  {
    field: 'amount',
    label: 'Importe',
    aliases: ['importe', 'monto', 'amount', 'precio', 'valor', 'total', 'suma'],
    type: 'currency',
    required: true,
  },
  {
    field: 'type',
    label: 'Ingreso o gasto',
    aliases: ['tipo', 'type', 'concepto', 'movimiento', 'ingreso o gasto', 'signo'],
    type: 'enum',
    enumValues: {
      INCOME: ['ingreso', 'income', 'cobro', 'entrada', 'venta', 'haber', 'credito', 'crédito'],
      EXPENSE: ['gasto', 'expense', 'egreso', 'salida', 'compra', 'debe', 'debito', 'débito'],
    },
    hint: 'Si no se mapea, todo entra como ingreso.',
  },
  {
    field: 'category',
    label: 'Categoría',
    aliases: ['categoria', 'categoría', 'category', 'rubro', 'concepto', 'detalle'],
    type: 'string',
  },
  {
    field: 'clientName',
    label: 'Cliente',
    aliases: ['cliente', 'client', 'razon social', 'razón social', 'a nombre de'],
    type: 'string',
    hint: 'Opcional. Se busca por nombre; si no aparece, el movimiento entra sin cliente.',
  },
  {
    field: 'notes',
    label: 'Notas',
    aliases: ['notas', 'notes', 'observaciones', 'comentarios', 'obs'],
    type: 'string',
  },
];

export const ENTITIES: Record<ImportEntity, EntityConfig> = {
  clients: {
    label: 'Clientes',
    description: 'Tu cartera: nombre, contacto, dirección y tipo de relación.',
    fields: CLIENT_SIGNATURES,
    dedupeFields: ['name', 'address'],
  },
  visits: {
    label: 'Visitas',
    description:
      'El historial de trabajos hechos. Importalo después de los clientes: cada visita se engancha al cliente por nombre.',
    fields: VISIT_SIGNATURES,
    dedupeFields: ['clientName', 'scheduledAt', 'serviceType'],
    clientNameField: 'clientName',
    clientRequired: true,
  },
  transactions: {
    label: 'Movimientos',
    description:
      'Ingresos y gastos históricos. El cliente es opcional: los gastos normalmente no tienen.',
    fields: TRANSACTION_SIGNATURES,
    dedupeFields: ['transactionDate', 'amount', 'category', 'clientName'],
    clientNameField: 'clientName',
    clientRequired: false,
  },
};

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  clients: ENTITIES.clients.label,
  visits: ENTITIES.visits.label,
  transactions: ENTITIES.transactions.label,
};

export const configFor = (entity: ImportEntity): EntityConfig => ENTITIES[entity];

export const signaturesFor = (entity: ImportEntity): ColumnSignature[] =>
  ENTITIES[entity].fields;

export const signatureOf = (
  entity: ImportEntity,
  field: string
): ColumnSignature | undefined =>
  ENTITIES[entity].fields.find((sig) => sig.field === field);
