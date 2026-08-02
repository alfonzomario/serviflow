import { describe, expect, it } from 'vitest';
import {
  autoMapColumns,
  detectDelimiter,
  normalisePhone,
  parseDelimited,
  parseImportDate,
  parseList,
  parseNumber,
  validateRows,
  type ColumnMapping,
} from './import';

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
    const mappings = autoMapColumns(['Nombre', 'Código interno'], 'clients');

    expect(mappings[1]).toMatchObject({ targetField: null, confidence: 'none' });
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

  it('rechaza lo que es demasiado corto para ser un teléfono', () => {
    expect(normalisePhone('123')).toBeNull();
    expect(normalisePhone('-')).toBeNull();
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
    const result = build('Nombre,Código interno\nAna,ABC-123');

    expect(result.validRows[0].values).toEqual({ name: 'Ana' });
  });
});
