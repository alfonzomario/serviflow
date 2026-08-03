/**
 * El motor del importador: parsear, mapear, validar.
 *
 * Todo lo que decide *qué* se va a escribir vive acá. Lo que efectivamente
 * escribe en la base está en `import.service.ts`. La división es la misma que
 * entre `pending.ts` y `visit.service.ts`, y por el mismo motivo: esta parte es
 * donde está el riesgo, así que tiene que poder probarse sin base de datos.
 *
 * Dos criterios que atraviesan todo el archivo:
 *
 *  - **Nunca rechazar una fila por un campo opcional.** Un email mal escrito no
 *    puede hacer perder un cliente: se importa sin email y queda el aviso. Solo
 *    falta un campo requerido tira la fila.
 *  - **La planilla es de otro.** Los formatos son los que son: separador `;`
 *    porque Excel en es-AR exporta así, números "1.234,56", fechas dd/MM/yyyy.
 *    Adaptarse es tarea nuestra, no del usuario.
 */

import {
  configFor,
  signaturesFor,
  type ColumnSignature,
  type ImportEntity,
} from '../lib/import/signatures';

// ─── Parseo ────────────────────────────────────────────────────────────────

/**
 * Elige el separador contando cuál produce más columnas en la primera línea.
 *
 * Excel en español exporta con `;` porque la coma es el separador decimal. Si
 * asumiéramos `,` esas planillas entrarían como una sola columna gigante.
 */
export const detectDelimiter = (firstLine: string): string => {
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestCount = 0;

  for (const candidate of candidates) {
    // Contar fuera de comillas, si no un "Pérez, Juan" infla la cuenta.
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }

  return best;
};

/**
 * Parser de CSV/TSV. Soporta comillas, comas y saltos de línea dentro de un
 * campo, y `""` como comilla escapada — o sea, lo que produce Excel.
 */
export const parseDelimited = (
  text: string
): { headers: string[]; rows: string[][] } => {
  // El BOM que mete Excel se cuela en el primer encabezado y rompe el mapeo.
  const clean = text.replace(/^﻿/, '');
  if (!clean.trim()) return { headers: [], rows: [] };

  const firstLineEnd = clean.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? clean : clean.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(firstLine);

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];

    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  // Última fila sin salto de línea final.
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const headers = (records.shift() ?? []).map((header) => header.trim());

  // Excel agrega filas totalmente vacías al final de casi cualquier export.
  const rows = records.filter((row) => row.some((cell) => cell.trim() !== ''));

  return { headers, rows };
};

// ─── Mapeo automático ──────────────────────────────────────────────────────

const normalise = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // sacar acentos
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

export type ColumnMapping = {
  /** Encabezado tal cual viene en el archivo. */
  sourceColumn: string;
  /** Índice de la columna, porque puede haber encabezados repetidos. */
  sourceIndex: number;
  /** Campo destino, o null si se ignora. */
  targetField: string | null;
  /** `auto` cuando lo detectamos, `manual` cuando lo eligió el usuario. */
  confidence: 'auto' | 'manual' | 'none';
};

/**
 * Empareja los encabezados del archivo contra los alias conocidos.
 *
 * Prioriza coincidencia exacta sobre parcial: con encabezados "Teléfono" y
 * "Teléfono alternativo", el exacto se queda con el campo y el otro no compite.
 * Un campo no se asigna dos veces — la segunda columna queda sin mapear para
 * que el usuario decida, en vez de pisar silenciosamente a la primera.
 */
export const autoMapColumns = (
  headers: string[],
  entity: ImportEntity
): ColumnMapping[] => {
  const signatures = signaturesFor(entity);
  const mappings: ColumnMapping[] = headers.map((header, index) => ({
    sourceColumn: header,
    sourceIndex: index,
    targetField: null,
    confidence: 'none',
  }));

  const taken = new Set<string>();

  const claim = (matcher: (header: string, sig: ColumnSignature) => boolean) => {
    for (const mapping of mappings) {
      if (mapping.targetField) continue;
      const header = normalise(mapping.sourceColumn);
      if (!header) continue;

      const match = signatures.find(
        (sig) => !taken.has(sig.field) && matcher(header, sig)
      );
      if (match) {
        mapping.targetField = match.field;
        mapping.confidence = 'auto';
        taken.add(match.field);
      }
    }
  };

  // Primera pasada: coincidencia exacta con algún alias.
  claim((header, sig) => sig.aliases.some((alias) => normalise(alias) === header));

  // Segunda: el encabezado contiene un alias (o al revés), para cosas como
  // "Nombre del cliente" o "Tel.".
  claim((header, sig) =>
    sig.aliases.some((alias) => {
      const normalised = normalise(alias);
      // Los dos lados tienen que ser largos para arriesgar un substring. Con
      // alias cortos "tel" pescaba "teletrabajo"; con encabezados cortos, un
      // "id" pelado caía en "modalidad" —que lo contiene— y se llevaba el campo
      // tipo de visita, dejando a la columna real sin mapear.
      if (normalised.length < 4 || header.length < 4) return false;
      return header.includes(normalised) || normalised.includes(header);
    })
  );

  return mappings;
};

// ─── Normalización de valores ──────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Convierte a número aceptando formato es-AR ("1.234,56") y en-US ("1,234.56").
 *
 * Cuando aparecen los dos separadores, el último es el decimal. Cuando hay uno
 * solo seguido de exactamente tres dígitos se asume separador de miles, que es
 * lo que hace que "1.500" sea mil quinientos y no uno coma cinco.
 */
export const parseNumber = (raw: string): number | null => {
  const value = raw.replace(/[^\d.,-]/g, '').trim();
  if (!value) return null;

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');

  let normalised: string;
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalised = value.split(thousandSep).join('').replace(decimalSep, '.');
  } else if (lastComma !== -1) {
    const decimals = value.length - lastComma - 1;
    normalised = decimals === 3 ? value.split(',').join('') : value.replace(',', '.');
  } else if (lastDot !== -1) {
    const decimals = value.length - lastDot - 1;
    normalised = decimals === 3 ? value.split('.').join('') : value;
  } else {
    normalised = value;
  }

  const parsed = Number(normalised);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Fechas en los formatos que aparecen en planillas reales. Prioriza dd/MM sobre
 * MM/dd: la planilla es argentina hasta que se demuestre lo contrario, y si el
 * primer número es mayor a 12 no hay ambigüedad posible.
 */
export const parseImportDate = (raw: string): Date | null => {
  const value = raw.trim();
  if (!value) return null;

  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const slash = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (slash) {
    let [, first, second, year] = slash;
    let day = Number(first);
    let month = Number(second);

    // Solo damos vuelta cuando el primero no puede ser día.
    if (day > 12 && month <= 12) {
      // dd/MM, ya está bien.
    } else if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }

    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const date = new Date(fullYear, month - 1, day);
    // Rechaza 31/02: el rollover de Date lo convertiría en marzo.
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  return null;
};

/**
 * Fija una fecha a medianoche UTC conservando el día del calendario.
 *
 * Para las columnas `DATE` de Postgres. `parseImportDate` devuelve medianoche
 * *local*, y Prisma escribe la parte UTC: en un servidor con offset positivo,
 * el 15/01 local es el 14/01 en UTC y se guardaría el día anterior. Es la misma
 * familia del bug que ya nos mordió al leer `Transaction.transactionDate` — solo
 * que del lado de la escritura, y no se nota en un servidor en UTC-3, que es
 * justo donde lo probamos.
 */
/**
 * Hora del día como minutos desde medianoche. Acepta "9", "9:30", "09:30:00",
 * "9.30" y el sufijo am/pm.
 */
export const parseTimeOfDay = (raw: string): number | null => {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  const match = value.match(/^(\d{1,2})(?:[:.h](\d{1,2}))?(?::\d{1,2})?\s*(am|pm)?/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const suffix = match[3];

  if (suffix === 'pm' && hours < 12) hours += 12;
  if (suffix === 'am' && hours === 12) hours = 0;

  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

export const toDateOnly = (date: Date): Date =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

/** Deja solo dígitos y el `+` inicial. Números demasiado cortos no son teléfonos. */
export const normalisePhone = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const plus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 6) return null;
  return plus ? `+${digits}` : digits;
};

export const parseList = (raw: string): string[] =>
  raw
    .split(/[,;/|]/)
    .map((item) => item.trim())
    .filter(Boolean);

/** Busca el valor canónico del enum comparando sin acentos ni mayúsculas. */
export const parseEnum = (raw: string, signature: ColumnSignature): string | null => {
  if (!signature.enumValues) return null;
  const value = normalise(raw);
  if (!value) return null;

  for (const [canonical, forms] of Object.entries(signature.enumValues)) {
    if (canonical.toLowerCase() === value) return canonical;
    if (forms.some((form) => normalise(form) === value)) return canonical;
  }
  return null;
};

// ─── Validación ────────────────────────────────────────────────────────────

/**
 * Clave de deduplicación. Las fechas se reducen al día: la misma visita
 * exportada dos veces puede traer horas distintas y sigue siendo la misma.
 */
export const dedupeKeyOf = (
  values: Record<string, unknown>,
  entity: ImportEntity
): string =>
  configFor(entity)
    .dedupeFields.map((field) => {
      const value = values[field];
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      return normalise(String(value ?? ''));
    })
    .join('|');

export type RowIssue = {
  /** Número de fila como lo ve el usuario en su planilla: 1 = primer dato. */
  row: number;
  field: string;
  label: string;
  type: 'error' | 'warning';
  message: string;
  originalValue: string;
};

export type PreparedRow = {
  row: number;
  values: Record<string, unknown>;
  /** Clave de deduplicación dentro del archivo. */
  dedupeKey: string;
};

export type ValidationResult = {
  totalRows: number;
  /** Filas que se van a importar (las que no tienen ningún error). */
  validRows: PreparedRow[];
  issues: RowIssue[];
  counts: { valid: number; warnings: number; errors: number };
  /** Campos requeridos que nadie mapeó. Bloquea la importación entera. */
  missingRequired: string[];
};

/**
 * Convierte las filas crudas en registros listos para escribir, juntando los
 * avisos por el camino.
 *
 * Una fila con error no se importa; una fila con warning sí, sin el campo que
 * falló. Esa distinción es la que evita que una planilla real —que siempre
 * tiene algo mal en alguna celda— se vuelva imposible de importar.
 */
export const validateRows = ({
  rows,
  mappings,
  entity,
}: {
  rows: string[][];
  mappings: ColumnMapping[];
  entity: ImportEntity;
}): ValidationResult => {
  const signatures = signaturesFor(entity);
  const active = mappings.filter((mapping) => mapping.targetField !== null);

  const mappedFields = new Set(active.map((mapping) => mapping.targetField as string));
  const labelOf = (field: string) =>
    signatures.find((sig) => sig.field === field)?.label ?? field;

  const missingRequired = signatures
    .filter((sig) => sig.required && !mappedFields.has(sig.field))
    .map((sig) => sig.label);

  // Grupos donde alcanza con uno: el cliente puede venir por nombre o por id,
  // pero alguno tiene que venir.
  for (const group of configFor(entity).requireOneOf ?? []) {
    if (group.some((field) => mappedFields.has(field))) continue;
    missingRequired.push(group.map(labelOf).join(' o '));
  }

  const issues: RowIssue[] = [];
  const validRows: PreparedRow[] = [];
  const rowsWithWarnings = new Set<number>();
  const seenKeys = new Map<string, number>();

  if (missingRequired.length > 0) {
    return {
      totalRows: rows.length,
      validRows: [],
      issues: [],
      counts: { valid: 0, warnings: 0, errors: 0 },
      missingRequired,
    };
  }

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const values: Record<string, unknown> = {};
    let hasError = false;

    for (const mapping of active) {
      const signature = signatures.find((sig) => sig.field === mapping.targetField);
      if (!signature) continue;

      const raw = (row[mapping.sourceIndex] ?? '').trim();

      const fail = (message: string) => {
        hasError = true;
        issues.push({
          row: rowNumber,
          field: signature.field,
          label: signature.label,
          type: 'error',
          message,
          originalValue: raw,
        });
      };

      const warn = (message: string) => {
        rowsWithWarnings.add(rowNumber);
        issues.push({
          row: rowNumber,
          field: signature.field,
          label: signature.label,
          type: 'warning',
          message,
          originalValue: raw,
        });
      };

      if (!raw) {
        if (signature.required) fail('Está vacío y es obligatorio');
        continue;
      }

      switch (signature.type) {
        case 'string':
          values[signature.field] = raw;
          break;

        case 'email': {
          if (!EMAIL_RE.test(raw)) {
            warn('No parece un email válido. Se importa sin email.');
            break;
          }
          values[signature.field] = raw.toLowerCase();
          break;
        }

        case 'phone': {
          const phone = normalisePhone(raw);
          if (!phone) {
            warn('No parece un teléfono. Se importa sin teléfono.');
            break;
          }
          values[signature.field] = phone;
          break;
        }

        case 'date': {
          const date = parseImportDate(raw);
          if (!date) {
            if (signature.required) fail('No se entiende la fecha');
            else warn('No se entiende la fecha. Se importa sin ese dato.');
            break;
          }
          values[signature.field] = date;
          break;
        }

        case 'currency': {
          const amount = parseNumber(raw);
          if (amount === null) {
            if (signature.required) fail('No se entiende el importe');
            else warn('No se entiende el importe. Se importa en 0.');
            break;
          }
          if (amount < 0) {
            warn('Es negativo. Se importa en 0.');
            values[signature.field] = 0;
            break;
          }
          values[signature.field] = amount;
          break;
        }

        case 'time': {
          const minutes = parseTimeOfDay(raw);
          if (minutes === null) {
            warn('No se entiende la hora. Se ignora ese dato.');
            break;
          }
          values[signature.field] = minutes;
          break;
        }

        case 'integer': {
          const parsed = parseNumber(raw);
          if (parsed === null || !Number.isFinite(parsed) || parsed < 1) {
            warn('No es un número válido. Se ignora ese dato.');
            break;
          }
          values[signature.field] = Math.round(parsed);
          break;
        }

        case 'list':
          values[signature.field] = parseList(raw);
          break;

        case 'enum': {
          const parsed = parseEnum(raw, signature);
          if (!parsed) {
            warn('Valor no reconocido. Se usa el valor por defecto.');
            break;
          }
          values[signature.field] = parsed;
          break;
        }
      }
    }

    if (hasError) return;

    // La app vieja guarda fecha y hora por separado. Se juntan acá para que
    // `scheduledAt` quede completo y las visitas no caigan todas a medianoche.
    const timeOfDay = values.timeOfDay as number | undefined;
    if (timeOfDay !== undefined && values.scheduledAt instanceof Date) {
      const withTime = new Date(values.scheduledAt);
      withTime.setHours(Math.floor(timeOfDay / 60), timeOfDay % 60, 0, 0);
      values.scheduledAt = withTime;
    }
    delete values.timeOfDay;

    // Dedupe dentro del archivo, con los campos que define la entidad. La
    // comparación contra lo que ya está en la base ocurre al ejecutar, no acá.
    const dedupeKey = dedupeKeyOf(values, entity);

    const firstSeen = seenKeys.get(dedupeKey);
    if (firstSeen !== undefined) {
      issues.push({
        row: rowNumber,
        field: 'name',
        label: 'Nombre',
        type: 'warning',
        message: `Repetido dentro del archivo (ya está en la fila ${firstSeen})`,
        originalValue: String(values.name ?? ''),
      });
      rowsWithWarnings.add(rowNumber);
    } else {
      seenKeys.set(dedupeKey, rowNumber);
    }

    validRows.push({ row: rowNumber, values, dedupeKey });
  });

  const errorRows = new Set(
    issues.filter((issue) => issue.type === 'error').map((issue) => issue.row)
  );

  return {
    totalRows: rows.length,
    validRows,
    issues,
    counts: {
      valid: validRows.length,
      warnings: rowsWithWarnings.size,
      errors: errorRows.size,
    },
    missingRequired: [],
  };
};

// ─── Resolución de clientes ────────────────────────────────────────────────

export type ClientRef = { id: string; name: string; externalId?: string | null };

export type ResolvedRows = {
  /** Filas que encontraron su cliente, con el `clientId` ya puesto. */
  resolved: ResolvedRow[];
  /**
   * Filas cuyo nombre de cliente no existe. Se devuelve la fila entera, no solo
   * el nombre: en las entidades donde el cliente es opcional —un gasto de nafta
   * no tiene cliente— estas filas igual se importan, sin enganche.
   */
  unmatched: (PreparedRow & { clientName: string })[];
  /** Los nombres distintos que no se encontraron, para mostrarlos juntos. */
  unmatchedNames: string[];
};

/**
 * Engancha cada fila con su cliente, por nombre normalizado.
 *
 * **Coincidencia exacta normalizada y nada más.** Adivinar sería peor que
 * fallar: una visita colgada del cliente equivocado no rompe nada visible en el
 * momento, pero corrompe Pendientes en silencio — le salda el período a quien no
 * corresponde y deja debiendo al que sí. Preferimos rechazar la fila y decir qué
 * nombre no apareció, que es algo que el usuario puede arreglar.
 *
 * Se mantiene pura recibiendo los clientes como parámetro, así el preview puede
 * mostrar los no encontrados antes de escribir nada.
 */
export type ResolvedRow = PreparedRow & { clientId: string };

export type ImportedJob = {
  /** Identificador dentro del lote, para enlazar las filas con su trabajo. */
  key: string;
  clientId: string;
  serviceType: string | null;
  totalApplications: number;
  /** Las filas que componen el trabajo, en orden de aplicación. */
  rows: ResolvedRow[];
};

/**
 * Infiere qué visitas de la planilla forman un mismo trabajo multi-visita.
 *
 * Acá se agrupa por cliente + servicio + total de aplicaciones, que es
 * *exactamente* el alambre que sacamos del runtime cuando `Job` pasó a ser una
 * fila. La diferencia no es cosmética: aquello estaba mal porque usaba el
 * agrupamiento como la **identidad** del trabajo, así que cambiar la cantidad de
 * aplicaciones lo partía en dos. Acá es una **inferencia por única vez**: la
 * planilla no trae ningún id de trabajo, así que agrupar es la única opción, y
 * el resultado se persiste como un `Job` de verdad que ya no depende de esto.
 *
 * Un trabajo se corta cuando la secuencia vuelve a empezar (aparece un número de
 * aplicación menor o igual al anterior) o cuando ya se completó. Eso separa dos
 * tratamientos iguales del mismo cliente en fechas distintas sin inventar
 * ventanas de tiempo arbitrarias.
 */
export const groupIntoJobs = (
  rows: ResolvedRow[]
): { jobs: ImportedJob[]; loose: ResolvedRow[] } => {
  const loose: ResolvedRow[] = [];
  const candidates = new Map<string, ResolvedRow[]>();

  for (const row of rows) {
    const total = row.values.totalApplications as number | undefined;
    if (!total || total <= 1) {
      loose.push(row);
      continue;
    }

    const serviceType = String(row.values.serviceType ?? '');
    const key = `${row.clientId}|${normalise(serviceType)}|${total}`;
    const group = candidates.get(key);
    if (group) group.push(row);
    else candidates.set(key, [row]);
  }

  const jobs: ImportedJob[] = [];

  for (const [key, group] of candidates) {
    const sorted = [...group].sort((a, b) => {
      const dateA = (a.values.scheduledAt as Date | undefined)?.getTime() ?? 0;
      const dateB = (b.values.scheduledAt as Date | undefined)?.getTime() ?? 0;
      if (dateA !== dateB) return dateA - dateB;
      return a.row - b.row;
    });

    const total = sorted[0].values.totalApplications as number;
    let current: ResolvedRow[] = [];
    let lastNumber = 0;

    const flush = () => {
      if (current.length === 0) return;
      jobs.push({
        key: `${key}#${jobs.length}`,
        clientId: current[0].clientId,
        serviceType: (current[0].values.serviceType as string | undefined) ?? null,
        totalApplications: total,
        rows: current,
      });
      current = [];
      lastNumber = 0;
    };

    for (const row of sorted) {
      const explicit = row.values.applicationNumber as number | undefined;
      // Sin número explícito, la posición dentro del trabajo alcanza.
      let number = explicit ?? lastNumber + 1;

      // La secuencia volvió a empezar, o el trabajo anterior ya está completo.
      if ((explicit !== undefined && explicit <= lastNumber) || current.length >= total) {
        flush();
        // Recalcular después del corte: el implícito arranca de nuevo en 1.
        number = explicit ?? 1;
      }

      current.push({
        ...row,
        values: { ...row.values, applicationNumber: number },
      });
      lastNumber = number;
    }

    flush();
  }

  return { jobs, loose };
};

export const resolveClientRefs = ({
  rows,
  clients,
  clientNameField,
  clientExternalIdField,
}: {
  rows: PreparedRow[];
  clients: ClientRef[];
  clientNameField: string;
  /** Campo con el id de origen. Cuando está, se prueba antes que el nombre. */
  clientExternalIdField?: string;
}): ResolvedRows => {
  // El id de origen es exacto y no depende de cómo esté escrito el nombre, así
  // que gana siempre que esté disponible. Es lo que hace viable migrar una
  // planilla que referencia al cliente por id, como la de la app vieja.
  const byExternalId = new Map<string, string>();
  for (const client of clients) {
    const key = String(client.externalId ?? '').trim().toLowerCase();
    if (key) byExternalId.set(key, client.id);
  }

  const byName = new Map<string, string>();
  // Un nombre repetido entre clientes es ambiguo: se saca del índice para que
  // esas filas caigan como "no encontrado" en vez de elegir una al azar.
  const ambiguous = new Set<string>();

  for (const client of clients) {
    const key = normalise(client.name);
    if (byName.has(key)) ambiguous.add(key);
    else byName.set(key, client.id);
  }
  for (const key of ambiguous) byName.delete(key);

  const resolved: ResolvedRow[] = [];
  const unmatched: (PreparedRow & { clientName: string })[] = [];
  const unmatchedNames = new Set<string>();

  for (const row of rows) {
    const rawExternalId = clientExternalIdField
      ? String(row.values[clientExternalIdField] ?? '').trim()
      : '';
    const rawName = String(row.values[clientNameField] ?? '');

    const clientId =
      (rawExternalId ? byExternalId.get(rawExternalId.toLowerCase()) : undefined) ??
      byName.get(normalise(rawName));

    if (!clientId) {
      unmatched.push({ ...row, clientName: rawName || rawExternalId });
      // Una celda vacía no es una referencia que no encontramos: es una fila que
      // no declara cliente, que en gastos es lo normal. No se reporta.
      const shown = rawName.trim() || rawExternalId;
      if (shown) unmatchedNames.add(shown);
      continue;
    }

    resolved.push({ ...row, clientId });
  }

  return {
    resolved,
    unmatched,
    unmatchedNames: [...unmatchedNames].sort(),
  };
};
