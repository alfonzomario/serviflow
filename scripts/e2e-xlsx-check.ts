/**
 * Verifica que un .xlsx real entre por el mismo camino que un CSV.
 *
 * Usa la variante `/node` de la librería, que comparte el parser con `/browser`
 * — lo que se prueba acá es la traducción celda → texto y el recorte de filas
 * fantasma, que es donde está el riesgo.
 *
 *   npx tsx scripts/e2e-xlsx-check.ts <archivo.xlsx>
 */

import readXlsxFile from 'read-excel-file/node';
import {
  autoMapColumns,
  parseDelimited,
  rowsToDelimited,
  validateRows,
} from '../src/server/services/import';

const ok = (label: string, condition: boolean, detail = '') => {
  console.log(`${condition ? '  ok  ' : ' FALLA'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) process.exitCode = 1;
};

// Mismas reglas que `src/lib/import/workbook.ts`. Se duplican a propósito: ese
// archivo importa la librería de navegador y no corre bajo tsx.
const cellToText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const rounded = new Date(Math.round(value.getTime() / 60000) * 60000);
    const year = rounded.getUTCFullYear();
    const month = String(rounded.getUTCMonth() + 1).padStart(2, '0');
    const day = String(rounded.getUTCDate()).padStart(2, '0');
    const hours = rounded.getUTCHours();
    const minutes = rounded.getUTCMinutes();
    if (hours === 0 && minutes === 0) return `${year}-${month}-${day}`;
    return `${year}-${month}-${day} ${String(hours).padStart(2, '0')}:${String(
      minutes
    ).padStart(2, '0')}`;
  }
  if (typeof value === 'boolean') return value ? 'sí' : 'no';
  return String(value);
};

const trimEmpty = (rows: string[][]): string[][] => {
  const trimmed = rows.filter((row) => row.some((cell) => cell.trim() !== ''));
  if (trimmed.length === 0) return [];
  let lastColumn = 0;
  for (const row of trimmed) {
    for (let index = row.length - 1; index >= 0; index--) {
      if (row[index].trim() !== '') {
        if (index > lastColumn) lastColumn = index;
        break;
      }
    }
  }
  return trimmed.map((row) => {
    const cells = row.slice(0, lastColumn + 1);
    while (cells.length <= lastColumn) cells.push('');
    return cells;
  });
};

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Pasá la ruta del .xlsx');

  const sheets = await readXlsxFile(path);
  console.log(`\nHojas: ${sheets.map((s) => s.sheet).join(' · ')}\n`);
  ok('detecta las 3 hojas', sheets.length === 3);

  // ── Hoja de clientes ───────────────────────────────────────────────────
  console.log('HOJA "Clientes"');
  const clientText = rowsToDelimited(
    trimEmpty(sheets[0].data.map((row) => row.map(cellToText)))
  );
  const { headers, rows } = parseDelimited(clientText);

  ok('5 encabezados', headers.length === 5, headers.join(' | '));
  ok('descarta la fila vacía y la columna fantasma', rows.length === 3);

  const mappings = autoMapColumns(headers, 'clients');
  ok(
    'mapea las 5 columnas solo',
    mappings.filter((m) => m.targetField).length === 5
  );

  const result = validateRows({ rows, mappings, entity: 'clients' });
  ok('las 3 filas son válidas', result.counts.valid === 3);

  const perez = result.validRows[0].values;
  ok('sobrevive la coma en el nombre', perez.name === 'Pérez, Juan');
  ok('normaliza el teléfono', perez.phone === '1155550001');
  ok('mapea el enum del tipo', perez.relationshipType === 'CONTRACT');

  const bar = result.validRows[1].values;
  ok('sobrevive la comilla en el nombre', bar.name === 'Bar "El Rincón"');
  ok('el email vacío no rompe', !('email' in bar));

  const ana = result.validRows[2].values;
  ok(
    'sobrevive el salto de línea en la dirección',
    typeof ana.address === 'string' && ana.address.includes('\n')
  );

  // ── Hoja de visitas ────────────────────────────────────────────────────
  console.log('\nHOJA "Visitas 2024"');
  const visitText = rowsToDelimited(
    trimEmpty(sheets[1].data.map((row) => row.map(cellToText)))
  );
  const visit = parseDelimited(visitText);
  const visitMappings = autoMapColumns(visit.headers, 'visits');
  const visitResult = validateRows({
    rows: visit.rows,
    mappings: visitMappings,
    entity: 'visits',
  });

  ok('las 2 visitas son válidas', visitResult.counts.valid === 2);

  const first = visitResult.validRows[0].values.scheduledAt as Date;
  ok(
    'la fecha de Excel llega bien',
    first instanceof Date &&
      first.getFullYear() === 2026 &&
      first.getMonth() === 2 &&
      first.getDate() === 15,
    first?.toString()
  );

  const second = visitResult.validRows[1].values.scheduledAt as Date;
  ok(
    'conserva la hora cuando la celda la trae',
    second.getHours() === 14 && second.getMinutes() === 30,
    second?.toString()
  );

  ok(
    'los decimales no se rompen',
    visitResult.validRows[0].values.price === 25000.5 &&
      visitResult.validRows[1].values.price === 1234.56,
    `${visitResult.validRows[0].values.price} / ${visitResult.validRows[1].values.price}`
  );

  // ── Hoja vacía ─────────────────────────────────────────────────────────
  console.log('\nHOJA "Vacía"');
  const emptyText = rowsToDelimited(
    trimEmpty(sheets[2].data.map((row) => row.map(cellToText)))
  );
  ok('no inventa filas', parseDelimited(emptyText).rows.length === 0);

  console.log(process.exitCode ? '\nHubo fallas.\n' : '\nTodo bien.\n');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
