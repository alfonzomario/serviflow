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

export type ImportEntity = 'clients';

export const ENTITY_LABELS: Record<ImportEntity, string> = {
  clients: 'Clientes',
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
    enumValues: {
      CONTRACT: ['abono', 'contrato', 'contract', 'mensual', 'recurrente', 'fijo', 'si', 'sí'],
      ON_DEMAND: ['ocasional', 'puntual', 'on demand', 'eventual', 'esporadico', 'esporádico', 'no'],
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

export const SIGNATURES: Record<ImportEntity, ColumnSignature[]> = {
  clients: CLIENT_SIGNATURES,
};

export const signaturesFor = (entity: ImportEntity): ColumnSignature[] => SIGNATURES[entity];

export const signatureOf = (
  entity: ImportEntity,
  field: string
): ColumnSignature | undefined => SIGNATURES[entity].find((sig) => sig.field === field);
