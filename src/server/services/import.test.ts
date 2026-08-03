import { describe, expect, it } from 'vitest';
import {
  autoMapColumns,
  detectDelimiter,
  normalisePhone,
  parseDelimited,
  parseImportDate,
  parseList,
  parseNumber,
  rowsToDelimited,
  parseTimeOfDay,
  googleSheetCsvUrl,
  groupIntoJobs,
  resolveClientRefs,
  parseEnum,
  toDateOnly,
  validateRows,
  type ColumnMapping,
} from './import';
import { signatureOf } from '../lib/import/signatures';

const mapOf = (mappings: ColumnMapping[]) =>
  Object.fromEntries(
    mappings.filter((m) => m.targetField).map((m) => [m.sourceColumn, m.targetField])
  );

describe('detectDelimiter', () => {
  it('detecta la coma', () => {
    expect(detectDelimiter('nombre,email,telefono')).toBe(',');
  });

  it('detecta el punto y coma que exporta Excel en español', () => {
    expect(detectDelimiter('nombre;email;telefono')).toBe(';');
  });

  it('detecta tabulaciones', () => {
    expect(detectDelimiter('nombre\temail\ttelefono')).toBe('\t');
  });

  it('no cuenta separadores que están dentro de comillas', () => {
    // Una sola columna cuyo contenido tiene comas no convierte al archivo en CSV.
    expect(detectDelimiter('"Pérez, Juan";telefono')).toBe(';');
  });
});

describe('parseDelimited', () => {
  it('separa encabezados de filas', () => {
    const { headers, rows } = parseDelimited('nombre,email\nAna,ana@test.com');

    expect(headers).toEqual(['nombre', 'email']);
    expect(rows).toEqual([['Ana', 'ana@test.com']]);
  });

  it('respeta comas dentro de comillas', () => {
    const { rows } = parseDelimited('nombre,dir\n"Pérez, Juan","Av. Siempreviva 742"');

    expect(rows[0]).toEqual(['Pérez, Juan', 'Av. Siempreviva 742']);
  });

  it('soporta saltos de línea dentro de un campo', () => {
    const { rows } = parseDelimited('nombre,notas\nAna,"Piso 3\nTimbre roto"');

    expect(rows).toHaveLength(1);
    expect(rows[0][1]).toBe('Piso 3\nTimbre roto');
  });

  it('entiende la comilla escapada de Excel', () => {
    const { rows } = parseDelimited('nombre\n"Bar ""El Rincón"""');

    expect(rows[0][0]).toBe('Bar "El Rincón"');
  });

  it('saca el BOM que Excel mete en el primer encabezado', () => {
    const { headers } = parseDelimited('﻿nombre,email\nAna,a@test.com');

    expect(headers[0]).toBe('nombre');
  });

  it('tolera CRLF', () => {
    const { headers, rows } = parseDelimited('nombre,email\r\nAna,a@test.com\r\n');

    expect(headers).toEqual(['nombre', 'email']);
    expect(rows).toEqual([['Ana', 'a@test.com']]);
  });

  it('descarta las filas vacías del final', () => {
    const { rows } = parseDelimited('nombre\nAna\n\n\n');

    expect(rows).toEqual([['Ana']]);
  });

  it('devuelve vacío para un archivo vacío', () => {
    expect(parseDelimited('   ')).toEqual({ headers: [], rows: [] });
  });
});

describe('autoMapColumns', () => {
  it('reconoce encabezados obvios', () => {
    const mappings = autoMapColumns(['Nombre', 'Email', 'Teléfono'], 'clients');

    expect(mapOf(mappings)).toEqual({
      Nombre: 'name',
      Email: 'email',
      Teléfono: 'phone',
    });
  });

  it('ignora acentos, mayúsculas y guiones bajos', () => {
    const mappings = autoMapColumns(['RAZON_SOCIAL', 'e-mail', 'DIRECCIÓN'], 'clients');

    expect(mapOf(mappings)).toEqual({
      RAZON_SOCIAL: 'name',
      'e-mail': 'email',
      DIRECCIÓN: 'address',
    });
  });

  it('reconoce encabezados que contienen un alias', () => {
    const mappings = autoMapColumns(['Nombre del cliente'], 'clients');

    expect(mapOf(mappings)).toEqual({ 'Nombre del cliente': 'name' });
  });

  it('no asigna el mismo campo a dos columnas', () => {
    // La segunda queda sin mapear para que la decida el usuario, en vez de
    // pisar a la primera sin avisar.
    const mappings = autoMapColumns(['Teléfono', 'Teléfono alternativo'], 'clients');

    expect(mappings[0].targetField).toBe('phone');
    expect(mappings[1].targetField).toBeNull();
  });

  it('deja sin mapear lo que no reconoce', () => {
    const mappings = autoMapColumns(['Nombre', 'Zona'], 'clients');

    expect(mappings[1]).toMatchObject({ targetField: null, confidence: 'none' });
  });

  it('reconoce la columna de id del sistema anterior', () => {
    // "Código interno" es un id de origen, no una columna a ignorar.
    const mappings = autoMapColumns(['Nombre', 'Código interno'], 'clients');

    expect(mappings[1].targetField).toBe('externalId');
  });

  it('no inventa coincidencias con alias muy cortos', () => {
    // "tel" no debe pescar "teletrabajo".
    const mappings = autoMapColumns(['Teletrabajo'], 'clients');

    expect(mappings[0].targetField).toBeNull();
  });
});

describe('parseNumber', () => {
  it('entiende el formato es-AR', () => {
    expect(parseNumber('1.234,56')).toBe(1234.56);
  });

  it('entiende el formato en-US', () => {
    expect(parseNumber('1,234.56')).toBe(1234.56);
  });

  it('trata un separador solo con tres decimales como miles', () => {
    expect(parseNumber('1.500')).toBe(1500);
    expect(parseNumber('1,500')).toBe(1500);
  });

  it('trata un separador solo con dos decimales como decimal', () => {
    expect(parseNumber('1,50')).toBe(1.5);
  });

  it('ignora el símbolo de moneda y los espacios', () => {
    expect(parseNumber('$ 25.000')).toBe(25000);
  });

  it('devuelve null cuando no hay número', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('a consultar')).toBeNull();
  });
});

describe('parseImportDate', () => {
  it('entiende dd/MM/yyyy', () => {
    expect(parseImportDate('15/08/2026')).toEqual(new Date(2026, 7, 15));
  });

  it('entiende ISO', () => {
    expect(parseImportDate('2026-08-15')).toEqual(new Date(2026, 7, 15));
  });

  it('entiende años de dos dígitos', () => {
    expect(parseImportDate('15/08/26')).toEqual(new Date(2026, 7, 15));
  });

  it('da vuelta MM/dd solo cuando el primero no puede ser día', () => {
    // 13 no es mes, así que 03/13 tiene que leerse como MM/dd.
    expect(parseImportDate('03/13/2026')).toEqual(new Date(2026, 2, 13));
  });

  it('ante ambigüedad asume dd/MM', () => {
    // 03/04 es 3 de abril, no 4 de marzo: la planilla es argentina.
    expect(parseImportDate('03/04/2026')).toEqual(new Date(2026, 3, 3));
  });

  it('rechaza fechas que no existen', () => {
    // Date haría rollover a marzo; eso sería importar un dato inventado.
    expect(parseImportDate('31/02/2026')).toBeNull();
  });

  it('devuelve null para basura', () => {
    expect(parseImportDate('cuando se pueda')).toBeNull();
    expect(parseImportDate('')).toBeNull();
  });
});

describe('normalisePhone', () => {
  it('deja solo dígitos', () => {
    expect(normalisePhone('(11) 5555-0001')).toBe('1155550001');
  });

  it('conserva el + internacional', () => {
    expect(normalisePhone('+54 9 11 5555-0001')).toBe('+5491155550001');
  });

});

describe('parseTimeOfDay', () => {
  it('entiende formato HH:mm', () => {
    expect(parseTimeOfDay('10:30')).toBe(630);
  });

  it('extrae la hora de fechas con formato de Excel tipo 1899-12-30 10:00', () => {
    expect(parseTimeOfDay('1899-12-30 10:00')).toBe(600);
  });
});

describe('parseList', () => {
  it('separa por coma, punto y coma o barra', () => {
    expect(parseList('Cucarachas, Roedores / Arañas; Mosquitos')).toEqual([
      'Cucarachas',
      'Roedores',
      'Arañas',
      'Mosquitos',
    ]);
  });

  it('descarta los vacíos', () => {
    expect(parseList('Uno,,Dos,')).toEqual(['Uno', 'Dos']);
  });
});

describe('validateRows', () => {
  const build = (csv: string) => {
    const { headers, rows } = parseDelimited(csv);
    return validateRows({
      rows,
      mappings: autoMapColumns(headers, 'clients'),
      entity: 'clients',
    });
  };

  it('prepara las filas buenas', () => {
    const result = build('Nombre,Email,Teléfono\nAna,ana@test.com,(11) 5555-0001');

    expect(result.counts).toEqual({ valid: 1, warnings: 0, errors: 0 });
    expect(result.validRows[0].values).toEqual({
      name: 'Ana',
      email: 'ana@test.com',
      phone: '1155550001',
    });
  });

  it('bloquea todo si falta un campo requerido sin mapear', () => {
    const result = build('Email\nana@test.com');

    expect(result.missingRequired).toEqual(['Nombre']);
    expect(result.validRows).toHaveLength(0);
  });

  it('rechaza la fila cuando el campo requerido viene vacío', () => {
    const result = build('Nombre,Email\n,ana@test.com');

    expect(result.counts.errors).toBe(1);
    expect(result.validRows).toHaveLength(0);
    expect(result.issues[0]).toMatchObject({ type: 'error', field: 'name' });
  });

  it('un email inválido es un aviso, no un rechazo', () => {
    // Perder un cliente por un email mal tipeado sería el peor resultado posible.
    const result = build('Nombre,Email\nAna,ana@@roto');

    expect(result.counts).toMatchObject({ valid: 1, errors: 0, warnings: 1 });
    expect(result.validRows[0].values).not.toHaveProperty('email');
    expect(result.issues[0].type).toBe('warning');
  });

  it('un teléfono ilegible es un aviso y la fila entra igual', () => {
    const result = build('Nombre,Teléfono\nAna,s/d');

    expect(result.counts.valid).toBe(1);
    expect(result.validRows[0].values).not.toHaveProperty('phone');
  });

  it('normaliza los enums escritos como se le ocurrió a cada uno', () => {
    const result = build(
      'Nombre,Tipo,Estado\nAna,Abono,Activo\nBeto,ocasional,BAJA'
    );

    expect(result.validRows[0].values).toMatchObject({
      relationshipType: 'CONTRACT',
      status: 'ACTIVE',
    });
    expect(result.validRows[1].values).toMatchObject({
      relationshipType: 'ON_DEMAND',
      status: 'INACTIVE',
    });
  });

  it('un enum desconocido avisa y usa el default', () => {
    const result = build('Nombre,Estado\nAna,quién sabe');

    expect(result.counts.valid).toBe(1);
    expect(result.validRows[0].values).not.toHaveProperty('status');
    expect(result.issues[0]).toMatchObject({ type: 'warning', field: 'status' });
  });

  it('parte las listas de servicios', () => {
    const result = build('Nombre,Servicios\nAna,"Cucarachas, Roedores"');

    expect(result.validRows[0].values.serviceTypes).toEqual(['Cucarachas', 'Roedores']);
  });

  it('marca los repetidos dentro del archivo sin descartarlos', () => {
    const result = build(
      'Nombre,Dirección\nAna,Calle 1\nAna,Calle 1'
    );

    // Los dos entran: decidir qué hacer con el duplicado es del paso siguiente.
    expect(result.counts.valid).toBe(2);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('fila 1');
  });

  it('no confunde con repetido a dos clientes del mismo nombre en distinta dirección', () => {
    const result = build('Nombre,Dirección\nAna,Calle 1\nAna,Calle 2');

    expect(result.issues).toHaveLength(0);
  });

  it('numera las filas como las ve el usuario en la planilla', () => {
    // Fila 1 = primer dato, no el encabezado ni un índice desde cero.
    const result = build('Nombre\nAna\n\nBeto');

    expect(result.validRows.map((row) => row.row)).toEqual([1, 2]);
  });

  it('cuenta una fila con dos problemas como una sola fila con aviso', () => {
    const result = build('Nombre,Email,Teléfono\nAna,roto,x');

    expect(result.issues).toHaveLength(2);
    expect(result.counts.warnings).toBe(1);
  });

  it('ignora las columnas sin mapear', () => {
    const result = build('Nombre,Zona\nAna,Norte');

    expect(result.validRows[0].values).toEqual({ name: 'Ana' });
  });
});

describe('visitas', () => {
  const build = (csv: string) => {
    const { headers, rows } = parseDelimited(csv)
    return validateRows({
      rows,
      mappings: autoMapColumns(headers, 'visits'),
      entity: 'visits',
    })
  }

  it('reconoce los encabezados típicos de una planilla de visitas', () => {
    const mappings = autoMapColumns(
      ['Cliente', 'Fecha', 'Servicio', 'Estado', 'Precio', 'Cobro'],
      'visits'
    )

    expect(mapOf(mappings)).toEqual({
      Cliente: 'clientName',
      Fecha: 'scheduledAt',
      Servicio: 'serviceType',
      Estado: 'status',
      Precio: 'price',
      Cobro: 'paymentStatus',
    })
  })

  it('exige fecha, y el cliente por nombre o por id', () => {
    expect(build('Servicio\nFumigación').missingRequired).toEqual(
      expect.arrayContaining(['Fecha', 'ID del cliente o Cliente'])
    )
  })

  it('rechaza la fila cuando la fecha no se entiende', () => {
    const result = build('Cliente,Fecha\nAna,cuando se pueda')

    expect(result.counts.errors).toBe(1)
    expect(result.validRows).toHaveLength(0)
  })

  it('normaliza los estados como los escribe cada uno', () => {
    const result = build(
      'Cliente,Fecha,Estado\nAna,01/03/2026,realizada\nBeto,02/03/2026,cancelada'
    )

    expect(result.validRows[0].values.status).toBe('COMPLETED')
    expect(result.validRows[1].values.status).toBe('CANCELLED')
  })

  it('entiende el precio en formato es-AR', () => {
    const result = build('Cliente,Fecha,Precio\nAna,01/03/2026,"$ 25.000"')

    expect(result.validRows[0].values.price).toBe(25000)
  })

  it('deduplica por cliente + fecha + servicio, no por nombre', () => {
    // Dos visitas al mismo cliente en fechas distintas no son un duplicado.
    const distintas = build(
      'Cliente,Fecha,Servicio\nAna,01/03/2026,Control\nAna,15/03/2026,Control'
    )
    expect(distintas.issues).toHaveLength(0)

    const repetida = build(
      'Cliente,Fecha,Servicio\nAna,01/03/2026,Control\nAna,01/03/2026,Control'
    )
    expect(repetida.issues).toHaveLength(1)
    expect(repetida.issues[0].message).toContain('fila 1')
  })
})

describe('resolveClientRefs', () => {
  const clients = [
    { id: 'c1', name: 'Panadería La Espiga' },
    { id: 'c2', name: 'Kiosco Don José' },
  ]

  const rowFor = (clientName: string, row = 1) => ({
    row,
    values: { clientName },
    dedupeKey: `${row}`,
  })

  const resolve = (rows: ReturnType<typeof rowFor>[], list = clients) =>
    resolveClientRefs({ rows, clients: list, clientNameField: 'clientName' })

  it('engancha por nombre exacto', () => {
    const result = resolve([rowFor('Panadería La Espiga')])

    expect(result.resolved[0].clientId).toBe('c1')
    expect(result.unmatched).toHaveLength(0)
  })

  it('ignora acentos, mayúsculas y espacios de más', () => {
    const result = resolve([rowFor('  PANADERIA  la espiga ')])

    expect(result.resolved[0].clientId).toBe('c1')
  })

  it('deja afuera lo que no encuentra, con el nombre', () => {
    const result = resolve([rowFor('Ferretería Central')])

    expect(result.resolved).toHaveLength(0)
    // Se devuelve la fila entera, no solo el nombre: donde el cliente es
    // opcional, estas filas igual se importan sin enganche.
    expect(result.unmatched).toHaveLength(1)
    expect(result.unmatched[0]).toMatchObject({
      row: 1,
      clientName: 'Ferretería Central',
      values: { clientName: 'Ferretería Central' },
    })
    expect(result.unmatchedNames).toEqual(['Ferretería Central'])
  })

  it('no adivina cuando dos clientes se llaman igual', () => {
    // Colgar la visita del cliente equivocado corrompe Pendientes en silencio,
    // así que la fila cae como no encontrada y la resuelve una persona.
    const result = resolve([rowFor('Kiosco Don José')], [
      { id: 'c2', name: 'Kiosco Don José' },
      { id: 'c3', name: 'kiosco don jose' },
    ])

    expect(result.resolved).toHaveLength(0)
    expect(result.unmatched).toHaveLength(1)
  })

  it('junta los nombres distintos que faltan, sin repetir', () => {
    const result = resolve([
      rowFor('Ferretería Central', 1),
      rowFor('Ferretería Central', 2),
      rowFor('Verdulería Norte', 3),
    ])

    expect(result.unmatched).toHaveLength(3)
    expect(result.unmatchedNames).toEqual(['Ferretería Central', 'Verdulería Norte'])
  })

  it('separa resueltas de no resueltas en el mismo archivo', () => {
    const result = resolve([
      rowFor('Panadería La Espiga', 1),
      rowFor('No existe', 2),
      rowFor('Kiosco Don José', 3),
    ])

    expect(result.resolved.map((row) => row.clientId)).toEqual(['c1', 'c2'])
    expect(result.unmatched.map((row) => row.row)).toEqual([2])
  })
})

describe('groupIntoJobs', () => {
  const app = (
    row: number,
    number: number | undefined,
    total: number | undefined,
    extra: { day?: number; clientId?: string; serviceType?: string } = {}
  ) => ({
    row,
    clientId: extra.clientId ?? 'c1',
    dedupeKey: `${row}`,
    values: {
      scheduledAt: new Date(2026, 0, extra.day ?? row),
      serviceType: extra.serviceType ?? 'Cucarachas',
      ...(number !== undefined ? { applicationNumber: number } : {}),
      ...(total !== undefined ? { totalApplications: total } : {}),
    } as Record<string, unknown>,
  })

  it('deja sueltas las visitas que no declaran un total', () => {
    const { jobs, loose } = groupIntoJobs([app(1, undefined, undefined)])

    expect(jobs).toHaveLength(0)
    expect(loose).toHaveLength(1)
  })

  it('no arma trabajo con un total de 1', () => {
    const { jobs, loose } = groupIntoJobs([app(1, 1, 1)])

    expect(jobs).toHaveLength(0)
    expect(loose).toHaveLength(1)
  })

  it('agrupa las aplicaciones de un mismo tratamiento', () => {
    const { jobs, loose } = groupIntoJobs([app(1, 1, 3), app(2, 2, 3)])

    expect(loose).toHaveLength(0)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ totalApplications: 3, clientId: 'c1' })
    expect(jobs[0].rows).toHaveLength(2)
  })

  it('separa dos tratamientos iguales cuando la secuencia vuelve a empezar', () => {
    // 1,2,1,2 son dos tratamientos de dos, no uno de cuatro.
    const { jobs } = groupIntoJobs([
      app(1, 1, 2, { day: 1 }),
      app(2, 2, 2, { day: 2 }),
      app(3, 1, 2, { day: 20 }),
      app(4, 2, 2, { day: 21 }),
    ])

    expect(jobs).toHaveLength(2)
    expect(jobs.every((job) => job.rows.length === 2)).toBe(true)
  })

  it('corta cuando el trabajo ya está completo, aunque no haya números', () => {
    const { jobs } = groupIntoJobs([
      app(1, undefined, 2),
      app(2, undefined, 2),
      app(3, undefined, 2),
    ])

    expect(jobs).toHaveLength(2)
    expect(jobs[0].rows).toHaveLength(2)
    expect(jobs[1].rows).toHaveLength(1)
  })

  it('numera las aplicaciones cuando la planilla no las trae', () => {
    const { jobs } = groupIntoJobs([app(1, undefined, 3), app(2, undefined, 3)])

    expect(jobs[0].rows.map((row) => row.values.applicationNumber)).toEqual([1, 2])
  })

  it('reinicia la numeración implícita después de un corte', () => {
    const { jobs } = groupIntoJobs([
      app(1, undefined, 2),
      app(2, undefined, 2),
      app(3, undefined, 2),
    ])

    expect(jobs[0].rows.map((row) => row.values.applicationNumber)).toEqual([1, 2])
    expect(jobs[1].rows.map((row) => row.values.applicationNumber)).toEqual([1])
  })

  it('ordena por fecha aunque la planilla venga desordenada', () => {
    const { jobs } = groupIntoJobs([app(1, 2, 2, { day: 20 }), app(2, 1, 2, { day: 5 })])

    expect(jobs).toHaveLength(1)
    expect(jobs[0].rows.map((row) => row.row)).toEqual([2, 1])
  })

  it('no mezcla tratamientos de clientes distintos', () => {
    const { jobs } = groupIntoJobs([
      app(1, 1, 2, { clientId: 'c1' }),
      app(2, 1, 2, { clientId: 'c2' }),
    ])

    expect(jobs).toHaveLength(2)
  })

  it('no mezcla servicios distintos del mismo cliente', () => {
    const { jobs } = groupIntoJobs([
      app(1, 1, 2, { serviceType: 'Cucarachas' }),
      app(2, 1, 2, { serviceType: 'Roedores' }),
    ])

    expect(jobs).toHaveLength(2)
  })

  it('separa un tratamiento de 2 de uno de 3 del mismo cliente y servicio', () => {
    const { jobs } = groupIntoJobs([app(1, 1, 2), app(2, 1, 3)])

    expect(jobs).toHaveLength(2)
    expect(jobs.map((job) => job.totalApplications).sort()).toEqual([2, 3])
  })

  it('separa sueltas de agrupadas en el mismo archivo', () => {
    const { jobs, loose } = groupIntoJobs([
      app(1, 1, 3),
      app(2, undefined, undefined),
      app(3, 2, 3),
    ])

    expect(jobs).toHaveLength(1)
    expect(jobs[0].rows).toHaveLength(2)
    expect(loose.map((row) => row.row)).toEqual([2])
  })
})

describe('toDateOnly', () => {
  it('fija la fecha a medianoche UTC conservando el día', () => {
    // parseImportDate devuelve medianoche local; Prisma escribe la parte UTC.
    // Sin esto, en un servidor con offset positivo el 15/01 se guardaría 14/01.
    const parsed = parseImportDate('15/01/2026')!
    const stored = toDateOnly(parsed)

    expect(stored.toISOString()).toBe('2026-01-15T00:00:00.000Z')
    expect(stored.getUTCDate()).toBe(15)
    expect(stored.getUTCMonth()).toBe(0)
  })

  it('no corre el día en ningún caso', () => {
    for (const raw of ['01/01/2026', '31/12/2026', '29/02/2024']) {
      const stored = toDateOnly(parseImportDate(raw)!)
      const [d, m, y] = raw.split('/').map(Number)
      expect(stored.toISOString().slice(0, 10)).toBe(
        `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      )
    }
  })
})

describe('movimientos', () => {
  const build = (csv: string) => {
    const { headers, rows } = parseDelimited(csv)
    return validateRows({
      rows,
      mappings: autoMapColumns(headers, 'transactions'),
      entity: 'transactions',
    })
  }

  it('reconoce los encabezados de una planilla de caja', () => {
    const mappings = autoMapColumns(
      ['Fecha', 'Importe', 'Tipo', 'Categoría', 'Cliente'],
      'transactions'
    )

    expect(mapOf(mappings)).toEqual({
      Fecha: 'transactionDate',
      Importe: 'amount',
      Tipo: 'type',
      Categoría: 'category',
      Cliente: 'clientName',
    })
  })

  it('exige fecha e importe', () => {
    expect(build('Categoría\nNafta').missingRequired).toEqual(
      expect.arrayContaining(['Fecha', 'Importe'])
    )
  })

  it('distingue ingreso de gasto como los escribe cada uno', () => {
    const result = build(
      'Fecha,Importe,Tipo\n01/03/2026,1000,cobro\n02/03/2026,500,egreso'
    )

    expect(result.validRows[0].values.type).toBe('INCOME')
    expect(result.validRows[1].values.type).toBe('EXPENSE')
  })

  it('entiende importes en formato es-AR', () => {
    const result = build('Fecha,Importe\n01/03/2026,"$ 1.234,56"')

    expect(result.validRows[0].values.amount).toBe(1234.56)
  })

  it('no descarta la fila sin cliente', () => {
    // Un gasto de nafta no tiene cliente y es perfectamente válido.
    const result = build('Fecha,Importe,Categoría\n01/03/2026,5000,Nafta')

    expect(result.counts.errors).toBe(0)
    expect(result.validRows).toHaveLength(1)
  })

  it('deduplica por fecha + importe + categoría + cliente', () => {
    const repetido = build(
      'Fecha,Importe,Categoría\n01/03/2026,1000,Visita\n01/03/2026,1000,Visita'
    )
    expect(repetido.issues).toHaveLength(1)

    // Mismo importe el mismo día pero otra categoría son dos movimientos.
    const distintos = build(
      'Fecha,Importe,Categoría\n01/03/2026,1000,Visita\n01/03/2026,1000,Nafta'
    )
    expect(distintos.issues).toHaveLength(0)
  })
})

describe('valores de la app vieja', () => {
  // Los estados y tipos que usa `legacy/index.html`. Sin estos alias la
  // migración caía al default en silencio — y OMITIDA_MES entrando como
  // realizada contaría como visita real un período que se saldó sin ir.
  const legacy: [Parameters<typeof signatureOf>[0], string, string, string][] = [
    ['visits', 'status', 'REALIZADA', 'COMPLETED'],
    ['visits', 'status', 'CONFIRMADA', 'CONFIRMED'],
    ['visits', 'status', 'POR_CONFIRMAR', 'PENDING_CONFIRM'],
    ['visits', 'status', 'CANCELADA', 'CANCELLED'],
    ['visits', 'status', 'OMITIDA_MES', 'SKIPPED'],
    ['visits', 'visitType', 'ABONO', 'CONTRACT'],
    ['visits', 'visitType', 'ESPECIAL', 'SPECIAL'],
    ['visits', 'paymentStatus', 'PAGADO', 'PAID'],
    ['visits', 'paymentStatus', 'PENDIENTE', 'PENDING'],
    ['clients', 'status', 'ACTIVO', 'ACTIVE'],
    ['clients', 'status', 'INACTIVO', 'INACTIVE'],
    ['clients', 'relationshipType', 'ABONO', 'CONTRACT'],
    ['clients', 'relationshipType', 'ESPECIAL', 'ON_DEMAND'],
    ['transactions', 'type', 'INGRESO', 'INCOME'],
  ]

  it.each(legacy)('%s.%s reconoce "%s"', (entity, field, raw, expected) => {
    expect(parseEnum(raw, signatureOf(entity, field)!)).toBe(expected)
  })
})

describe('encabezados cortos', () => {
  it('no deja que un "id" pelado se lleve un campo por substring', () => {
    // "modalidad" contiene "id": sin el guard, la columna id de la app vieja se
    // mapeaba a tipo de visita y dejaba a la columna real sin mapear.
    const mappings = autoMapColumns(['id', 'type'], 'visits')

    expect(mappings[0].targetField).toBeNull()
    expect(mappings[1].targetField).toBe('visitType')
  })
})

describe('parseTimeOfDay', () => {
  it('entiende los formatos usuales', () => {
    expect(parseTimeOfDay('09:00')).toBe(9 * 60)
    expect(parseTimeOfDay('14:30')).toBe(14 * 60 + 30)
    expect(parseTimeOfDay('9')).toBe(9 * 60)
    expect(parseTimeOfDay('9.30')).toBe(9 * 60 + 30)
    expect(parseTimeOfDay('08:00:00')).toBe(8 * 60)
  })

  it('entiende am/pm', () => {
    expect(parseTimeOfDay('2:30 pm')).toBe(14 * 60 + 30)
    expect(parseTimeOfDay('12:00 am')).toBe(0)
    expect(parseTimeOfDay('12:00 pm')).toBe(12 * 60)
  })

  it('rechaza lo que no es una hora', () => {
    expect(parseTimeOfDay('25:00')).toBeNull()
    expect(parseTimeOfDay('10:75')).toBeNull()
    expect(parseTimeOfDay('a la tarde')).toBeNull()
    expect(parseTimeOfDay('')).toBeNull()
  })
})

describe('migración desde la app vieja', () => {
  it('junta la fecha y la hora, que el legacy guarda separadas', () => {
    // Sin esto todas las visitas migradas caían a medianoche.
    const { headers, rows } = parseDelimited(
      'clientId,date,time\ncli-1,2026-02-15,14:30'
    )
    const result = validateRows({
      rows,
      mappings: autoMapColumns(headers, 'visits'),
      entity: 'visits',
    })

    const when = result.validRows[0].values.scheduledAt as Date
    expect(when.getHours()).toBe(14)
    expect(when.getMinutes()).toBe(30)
    // La hora no queda como campo suelto.
    expect(result.validRows[0].values).not.toHaveProperty('timeOfDay')
  })

  it('acepta el cliente por id o por nombre, pero exige alguno', () => {
    const soloId = parseDelimited('clientId,date\ncli-1,2026-02-15')
    expect(
      validateRows({
        rows: soloId.rows,
        mappings: autoMapColumns(soloId.headers, 'visits'),
        entity: 'visits',
      }).missingRequired
    ).toEqual([])

    const ninguno = parseDelimited('date,price\n2026-02-15,100')
    expect(
      validateRows({
        rows: ninguno.rows,
        mappings: autoMapColumns(ninguno.headers, 'visits'),
        entity: 'visits',
      }).missingRequired
    ).toContain('ID del cliente o Cliente')
  })

  it('engancha por el id de origen antes que por el nombre', () => {
    const clients = [
      { id: 'uuid-1', name: 'Panadería del Sol', externalId: 'cli-0007' },
      { id: 'uuid-2', name: 'Otro', externalId: 'cli-0012' },
    ]

    const result = resolveClientRefs({
      rows: [
        { row: 1, dedupeKey: '1', values: { clientExternalId: 'cli-0007' } },
        // El id manda aunque el nombre apunte a otro cliente: es exacto.
        { row: 2, dedupeKey: '2', values: { clientExternalId: 'cli-0012', clientName: 'Panadería del Sol' } },
      ],
      clients,
      clientNameField: 'clientName',
      clientExternalIdField: 'clientExternalId',
    })

    expect(result.resolved.map((r) => r.clientId)).toEqual(['uuid-1', 'uuid-2'])
  })

  it('cae al nombre cuando la fila no trae id', () => {
    const result = resolveClientRefs({
      rows: [{ row: 1, dedupeKey: '1', values: { clientName: 'Panadería del Sol' } }],
      clients: [{ id: 'uuid-1', name: 'Panadería del Sol', externalId: 'cli-0007' }],
      clientNameField: 'clientName',
      clientExternalIdField: 'clientExternalId',
    })

    expect(result.resolved[0].clientId).toBe('uuid-1')
  })

  it('reporta el id cuando no encuentra al cliente y no hay nombre', () => {
    const result = resolveClientRefs({
      rows: [{ row: 1, dedupeKey: '1', values: { clientExternalId: 'cli-9999' } }],
      clients: [{ id: 'uuid-1', name: 'Otro', externalId: 'cli-0007' }],
      clientNameField: 'clientName',
      clientExternalIdField: 'clientExternalId',
    })

    expect(result.resolved).toHaveLength(0)
    expect(result.unmatchedNames).toEqual(['cli-9999'])
  })
})

describe('solicitudes', () => {
  const build = (csv: string) => {
    const { headers, rows } = parseDelimited(csv)
    return validateRows({
      rows,
      mappings: autoMapColumns(headers, 'requests'),
      entity: 'requests',
    })
  }

  it('reconoce los encabezados de una bandeja de pedidos', () => {
    const mappings = autoMapColumns(
      ['Cliente', 'Servicios', 'Urgencia', 'Estado', 'Comentario', 'Fecha'],
      'requests'
    )

    expect(mapOf(mappings)).toEqual({
      Cliente: 'clientName',
      Servicios: 'serviceTypes',
      Urgencia: 'urgency',
      Estado: 'status',
      Comentario: 'comment',
      Fecha: 'createdAt',
    })
  })

  it('acepta el cliente por nombre o por id, pero exige alguno', () => {
    expect(build('Comentario\nVinieron por hormigas').missingRequired.length)
      .toBeGreaterThan(0)
    expect(build('Cliente,Comentario\nAna,Hormigas').missingRequired).toEqual([])
    expect(build('ID cliente,Comentario\ncli-1,Hormigas').missingRequired).toEqual([])
  })

  it('normaliza la urgencia como la escribe cada uno', () => {
    const result = build(
      'Cliente,Urgencia\nAna,urgente\nBeto,normal\nCeci,sin apuro'
    )

    expect(result.validRows.map((row) => row.values.urgency)).toEqual([
      'HIGH',
      'MEDIUM',
      'LOW',
    ])
  })

  it('normaliza el estado', () => {
    const result = build('Cliente,Estado\nAna,abierta\nBeto,con turno\nCeci,resuelta')

    expect(result.validRows.map((row) => row.values.status)).toEqual([
      'PENDING',
      'SCHEDULED',
      'CLOSED',
    ])
  })

  it('parte la lista de servicios pedidos', () => {
    const result = build('Cliente,Servicios\nAna,"Cucarachas; Roedores"')

    expect(result.validRows[0].values.serviceTypes).toEqual(['Cucarachas', 'Roedores'])
  })

  it('no descarta la fila si no viene la fecha', () => {
    // Sin fecha se usa la de la importación; perder el pedido sería peor.
    const result = build('Cliente,Comentario\nAna,Llamó por hormigas')

    expect(result.counts.valid).toBe(1)
    expect(result.validRows[0].values).not.toHaveProperty('createdAt')
  })
})

describe('notas', () => {
  const build = (csv: string) => {
    const { headers, rows } = parseDelimited(csv)
    return validateRows({
      rows,
      mappings: autoMapColumns(headers, 'notes'),
      entity: 'notes',
    })
  }

  it('reconoce encabezados de una hoja de apuntes', () => {
    const mappings = autoMapColumns(['Nota', 'Recordatorio', 'Fecha'], 'notes')

    expect(mapOf(mappings)).toEqual({
      Nota: 'content',
      Recordatorio: 'reminderAt',
      Fecha: 'createdAt',
    })
  })

  it('exige el contenido', () => {
    expect(build('Fecha\n01/03/2026').missingRequired).toEqual(['Contenido'])
  })

  it('rechaza la fila con contenido vacío', () => {
    const result = build('Nota,Fecha\n,01/03/2026')

    expect(result.counts.errors).toBe(1)
    expect(result.validRows).toHaveLength(0)
  })

  it('un recordatorio ilegible es un aviso, no un rechazo', () => {
    const result = build('Nota,Recordatorio\nLlamar a Ana,cuando se pueda')

    expect(result.counts.valid).toBe(1)
    expect(result.validRows[0].values).not.toHaveProperty('reminderAt')
    expect(result.issues[0].type).toBe('warning')
  })

  it('conserva saltos de línea dentro de una nota', () => {
    const result = build('Nota\n"Piso 3\nTimbre roto"')

    expect(result.validRows[0].values.content).toBe('Piso 3\nTimbre roto')
  })
})

describe('equipo', () => {
  const build = (csv: string) => {
    const { headers, rows } = parseDelimited(csv)
    return validateRows({
      rows,
      mappings: autoMapColumns(headers, 'users'),
      entity: 'users',
    })
  }

  it('reconoce encabezados de una lista de empleados', () => {
    const mappings = autoMapColumns(['Nombre', 'Email', 'Rol'], 'users')

    expect(mapOf(mappings)).toEqual({
      Nombre: 'name',
      Email: 'email',
      Rol: 'role',
    })
  })

  it('exige nombre y email', () => {
    expect(build('Rol\noperario').missingRequired).toEqual(
      expect.arrayContaining(['Nombre', 'Email'])
    )
  })

  it('normaliza los roles como los escribe cada uno', () => {
    const result = build(
      'Nombre,Email,Rol\nAna,ana@t.com,dueño\nBeto,beto@t.com,encargado\nCeci,ceci@t.com,técnico'
    )

    expect(result.validRows.map((row) => row.values.role)).toEqual([
      'OWNER',
      'ADMIN',
      'OPERATOR',
    ])
  })

  it('rechaza la fila con email inválido en vez de avisar', () => {
    // Acá el email no es un dato de contacto: es la identidad del usuario.
    // Importar a alguien sin email dejaría una ficha que nadie puede activar.
    const result = build('Nombre,Email\nAna,ana@@roto')

    expect(result.counts.errors).toBe(1)
    expect(result.validRows).toHaveLength(0)
  })

  it('marca como repetido el mismo email dos veces', () => {
    const result = build('Nombre,Email\nAna,ana@t.com\nAna R,ana@t.com')

    expect(result.issues.some((issue) => issue.message.includes('fila 1'))).toBe(true)
  })
})

describe('rowsToDelimited', () => {
  const roundTrip = (rows: string[][]) => {
    const { headers, rows: parsed } = parseDelimited(rowsToDelimited(rows))
    return [headers, ...parsed]
  }

  it('vuelve a salir igual que entró', () => {
    const rows = [
      ['Nombre', 'Dirección'],
      ['Ana', 'Calle 1'],
    ]

    expect(roundTrip(rows)).toEqual(rows)
  })

  it('sobrevive comas, punto y coma y comillas dentro de una celda', () => {
    // Son justo los caracteres que romperían un CSV ingenuo.
    const rows = [
      ['Nombre', 'Notas'],
      ['Pérez, Juan', 'Dijo "mañana"; no vino'],
    ]

    expect(roundTrip(rows)).toEqual(rows)
  })

  it('sobrevive saltos de línea dentro de una celda', () => {
    const rows = [
      ['Nombre', 'Notas'],
      ['Ana', 'Piso 3\nTimbre roto'],
    ]

    expect(roundTrip(rows)).toEqual(rows)
  })

  it('sobrevive tabulaciones dentro de una celda', () => {
    // El separador que elegimos, metido adentro del dato.
    const rows = [
      ['Nombre', 'Notas'],
      ['Ana', 'col1\tcol2'],
    ]

    expect(roundTrip(rows)).toEqual(rows)
  })

  it('no cita lo que no lo necesita', () => {
    expect(rowsToDelimited([['Ana', 'Calle 1']])).toBe('Ana\tCalle 1')
  })

  it('conserva las celdas vacías, que corren las columnas', () => {
    const rows = [
      ['Nombre', 'Email', 'Teléfono'],
      ['Ana', '', '1155550001'],
    ]

    expect(roundTrip(rows)).toEqual(rows)
  })
})

describe('parseImportDate con hora', () => {
  it('toma la hora cuando viene pegada a la fecha ISO', () => {
    // Una celda de Excel trae fecha y hora en el mismo valor.
    expect(parseImportDate('2026-03-20 14:30')).toEqual(new Date(2026, 2, 20, 14, 30))
  })

  it('acepta la T de ISO', () => {
    expect(parseImportDate('2026-03-20T14:30')).toEqual(new Date(2026, 2, 20, 14, 30))
  })

  it('toma la hora en formato dd/MM', () => {
    expect(parseImportDate('20/03/2026 14:30')).toEqual(new Date(2026, 2, 20, 14, 30))
  })

  it('sin hora sigue cayendo a medianoche', () => {
    expect(parseImportDate('2026-03-20')).toEqual(new Date(2026, 2, 20))
  })

  it('ignora una hora imposible en vez de correr el día', () => {
    // 25:00 haría rollover al día siguiente si lo pasáramos a Date.
    expect(parseImportDate('2026-03-20 25:00')).toEqual(new Date(2026, 2, 20))
  })

  it('no confunde el año con una hora', () => {
    expect(parseImportDate('2026-03-20')).toEqual(new Date(2026, 2, 20))
    expect(parseImportDate('15/08/26')).toEqual(new Date(2026, 7, 15))
  })
})

describe('googleSheetCsvUrl', () => {
  const ID = '1lFpxmaCuF4ySL_PaUbV9yqo8s7k5CRS3-zCrgyVmBfk'

  it('traduce el link de edición', () => {
    expect(googleSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBe(
      `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=0`
    )
  })

  it('toma el gid del hash', () => {
    expect(
      googleSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=98765`)
    ).toContain('gid=98765')
  })

  it('toma el gid de la query', () => {
    expect(
      googleSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1234`)
    ).toContain('gid=1234')
  })

  it('rechaza cualquier host que no sea Google', () => {
    // La descarga la hace el servidor: aceptar una URL cualquiera sería dejar
    // que alguien le pida cosas a la red interna.
    expect(googleSheetCsvUrl('https://evil.com/spreadsheets/d/abc/edit')).toBeNull()
    expect(googleSheetCsvUrl('http://169.254.169.254/latest/meta-data/')).toBeNull()
    expect(googleSheetCsvUrl('https://docs.google.com.evil.com/spreadsheets/d/x')).toBeNull()
  })

  it('rechaza http', () => {
    expect(googleSheetCsvUrl(`http://docs.google.com/spreadsheets/d/${ID}/edit`)).toBeNull()
  })

  it('rechaza otras rutas de Google', () => {
    expect(googleSheetCsvUrl('https://docs.google.com/document/d/abc/edit')).toBeNull()
  })

  it('rechaza lo que no es una URL', () => {
    expect(googleSheetCsvUrl('mi planilla')).toBeNull()
    expect(googleSheetCsvUrl('')).toBeNull()
  })

  it('ignora lo que venga colgado del link original', () => {
    // Se reconstruye desde el id, no se reenvía la URL que llegó.
    expect(
      googleSheetCsvUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing&x=1`)
    ).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=0`)
  })
})
